import { desc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { apiKeys, organization, userSettings } from '../../db/schema'
import { claudeBinary, claudeVersion, mayUseClaude, SPROCKET_EFFORTS, SPROCKET_MODEL_ALIASES } from '../../utils/sprocketAgent'
import { instanceMessagesToday, sprocketInstanceView } from '../../utils/sprocketInstance'
import { MANNER_TABLE, resolveManner } from '../../utils/sprocketManner'

/**
 * Who answers as Sprocket, and what there is to choose from: the caller's agents (API keys,
 * from every workspace, since a key belongs to one) and whether Claude Code can run here.
 */
export default defineEventHandler(async (event) => {
  const userId = event.context.session.user.id

  const [[settings], keys, allowed] = await Promise.all([
    db.select().from(userSettings).where(eq(userSettings.userId, userId)),
    db
      .select({ key: apiKeys, teamName: organization.name })
      .from(apiKeys)
      .leftJoin(organization, eq(organization.id, apiKeys.teamId))
      .where(eq(apiKeys.userId, userId))
      .orderBy(desc(apiKeys.createdAt)),
    mayUseClaude(userId)
  ])

  const bin = allowed ? claudeBinary() : null
  const now = Date.now()

  // Which one answers this person: Claude Code, their own OpenRouter key, or the instance's key (site-wide Sprocket).
  const instance = await sprocketInstanceView()
  const instanceOn = instance.forEveryone && instance.keySet
  const provider = settings?.sprocketProvider ?? 'openrouter'
  const answersWith = provider === 'agent'
    ? 'agent'
    : settings?.openrouterApiKey ? 'own-key' : instanceOn ? 'instance-key' : null

  return {
    answersWith,
    // Sprocket's manner: the person's pick, the site default, and the one that answers (sprocketManner.ts).
    manner: {
      pick: settings?.sprocketManner ?? null,
      siteDefault: instance.defaultManner,
      effective: resolveManner(settings?.sprocketManner, instance.defaultManner),
      options: Object.values(MANNER_TABLE).map(({ id, label, sample }) => ({ id, label, sample }))
    },
    instance: {
      on: instanceOn,
      model: instance.model,
      userDailyLimit: instance.userDailyLimit,
      usedToday: instanceOn ? await instanceMessagesToday(userId) : 0
    },
    provider,
    agentKeyId: settings?.sprocketAgentKeyId ?? null,
    model: settings?.sprocketModel ?? 'haiku',
    effort: settings?.sprocketEffort ?? null,
    hasOpenRouterKey: Boolean(settings?.openrouterApiKey),
    openrouterModel: settings?.openrouterModel ?? null,
    agents: keys.map(({ key, teamName }) => ({
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      workspace: key.teamId ? (teamName ?? 'Team') : 'Personal',
      scopes: key.scopes,
      usable: key.scopes.includes('boards:read') && !(key.expiresAt && key.expiresAt <= now)
    })),
    claude: {
      allowed,
      available: Boolean(bin),
      version: bin ? await claudeVersion(bin) : null
    },
    models: SPROCKET_MODEL_ALIASES,
    efforts: SPROCKET_EFFORTS
  }
})
