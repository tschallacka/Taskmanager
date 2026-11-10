import { db } from '../db'
import { userSettings } from '../db/schema'
import { eq } from 'drizzle-orm'
import { CHAT_SYSTEM_PROMPT } from '../utils/chatTools'
import { trimHistory, toProviderMessages } from '../utils/chatHistory'
import type { WireMessage } from '../utils/chatHistory'
import { DEFAULT_OPENROUTER_MODEL } from '../utils/ai'
import { agentChatResponse } from '../utils/sprocketAgent'
import { chooseOpenRouterAnswer, siteDefaultManner } from '../utils/sprocketInstance'
import { promptWithManner, resolveManner } from '../utils/sprocketManner'
import { sprocketPersonOf } from '../utils/sprocketPerson'
import { sprocketRunContext } from '../utils/sprocketRun'
import { sprocketAnswerStream } from '../utils/sprocketLoop'
import type { ProviderMessage } from '../utils/sprocketLoop'

// Chat endpoint for the Sprocket assistant. Streams NDJSON events to the client:
//   { type: 'agent_tool', id, name, state }  — a step Sprocket took: running, done or failed
//   { type: 'ping' }                         — keepalive, no payload
//   { type: 'delta', text }                  — the answer
//   { type: 'done' }                         — stream complete
//   { type: 'error', message }               — failure
// Sprocket runs its tools on the server, as the person (sprocketRun.ts): on OpenRouter the loop is in
// utils/sprocketLoop.ts, on Claude Code the run executes its own tools through the MCP endpoint (utils/sprocketAgent.ts).
// The browser runs no tools.

interface RequestBody {
  messages: WireMessage[]
  thinking?: boolean
  /** The client's local date (YYYY-MM-DD) so relative dates resolve correctly. */
  today?: string
}

export default defineEventHandler(async (event) => {
  const userId = event.context.session.user.id
  const body = await readBody<RequestBody>(event)

  const history = Array.isArray(body.messages) ? trimHistory(body.messages) : []
  if (history.length === 0) throw createError({ statusCode: 400, statusMessage: 'Missing messages' })

  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId))
  const thinking = body.thinking === true
  const today = typeof body.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.today)
    ? body.today
    : new Date().toISOString().slice(0, 10)

  // The manner of this person's answers: their own pick, else the site default (the tone only, see sprocketManner.ts).
  const manner = resolveManner(settings?.sprocketManner, await siteDefaultManner())

  if (settings?.sprocketProvider === 'agent') {
    return agentChatResponse({
      userId,
      settings: { agentKeyId: settings.sprocketAgentKeyId, model: settings.sprocketModel, effort: settings.sprocketEffort },
      history,
      today,
      thinking,
      manner
    })
  }

  // The user's own key answers first; without one, the instance's key answers when the admin has turned Sprocket on
  // for everyone, counted against the user's daily limit.
  const own = settings?.openrouterApiKey
    ? { apiKey: settings.openrouterApiKey, model: settings.openrouterModel || DEFAULT_OPENROUTER_MODEL }
    : null
  const answer = await chooseOpenRouterAnswer(own, userId)
  if (!answer) throw createError({ statusCode: 400, statusMessage: 'Sprocket has no OpenRouter key. Add one in Settings, or let Claude Code answer in Settings → Sprocket.' })

  const context = await sprocketRunContext(await sprocketPersonOf(userId))
  const messages: ProviderMessage[] = [
    { role: 'system', content: `${promptWithManner(CHAT_SYSTEM_PROMPT, manner)}\n\nToday is ${today}.` },
    ...(toProviderMessages(history) as unknown as ProviderMessage[])
  ]

  return sprocketAnswerStream({
    userId,
    apiKey: answer.apiKey,
    model: answer.model,
    messages,
    context,
    thinking
  })
})
