// Site-wide Sprocket: the instance admin sets one OpenRouter key and model on Instance settings, and every signed-in
// user gets Sprocket on it when the switch is on. A user who set a key of their own keeps using it; the instance key is
// the fallback. Each message counts against the user's daily limit and the instance's daily cap. The counts live in
// rate_limit_hits (one row per scope and UTC day), so they hold across processes and restarts, and no new table is
// needed for them.
import { eq, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { db } from '../db'
import { instanceSettings, rateLimitHits } from '../db/schema'
import { genId } from './projects'
import { decryptSecret, encryptSecret, secretsUnavailableReason } from './secretCrypto'
import { isSprocketManner, resolveManner, SPROCKET_MANNERS } from './sprocketManner'
import type { SprocketManner } from './sprocketManner'

export const SPROCKET_INSTANCE_ROW_ID = 'instance'
export const SPROCKET_DEFAULT_MODEL = 'openai/gpt-4o-mini'
const KEY_CONTEXT = 'instance-settings:sprocket-openrouter-key'
const INSTANCE_SCOPE = 'sprocket:instance'
const MAX_DAILY = 1_000_000

export interface SprocketInstanceView {
  forEveryone: boolean
  model: string
  /** Whether a key is stored. The key itself is never returned: `keyMasked` shows its last four characters only. */
  keySet: boolean
  keyMasked: string | null
  userDailyLimit: number
  instanceDailyCap: number
  /** The site default manner, used by everyone who has picked none (sprocketManner.ts). */
  defaultManner: SprocketManner
  /** Why the key cannot be stored or read on this install (SECRETS_ENCRYPTION_KEY), or null. */
  keyProblem: string | null
}

export interface SprocketInstancePatch {
  forEveryone?: boolean
  model?: string
  /** A new key, or null to clear the stored one. Omitted keeps the stored key as it is. */
  apiKey?: string | null
  userDailyLimit?: number
  instanceDailyCap?: number
  defaultManner?: string
}

/** The site default manner as stored (Professional before the admin saves one). */
export async function siteDefaultManner(): Promise<SprocketManner> {
  const row = await storedRow()
  return resolveManner(row?.sprocketDefaultManner, null)
}

/** The stored settings, or the defaults before the admin has saved any. */
async function storedRow() {
  const [row] = await db.select().from(instanceSettings).where(eq(instanceSettings.id, SPROCKET_INSTANCE_ROW_ID))
  return row ?? null
}

export function maskKey(key: string): string {
  return `••••${key.slice(-4)}`
}

export async function sprocketInstanceView(): Promise<SprocketInstanceView> {
  const row = await storedRow()
  return {
    forEveryone: row?.sprocketForEveryone ?? false,
    model: row?.sprocketModel ?? SPROCKET_DEFAULT_MODEL,
    keySet: Boolean(row?.sprocketOpenrouterKey),
    keyMasked: row?.sprocketOpenrouterKey ? maskKey(decryptForMask(row.sprocketOpenrouterKey)) : null,
    userDailyLimit: row?.sprocketUserDailyLimit ?? 200,
    instanceDailyCap: row?.sprocketInstanceDailyCap ?? 2000,
    defaultManner: resolveManner(row?.sprocketDefaultManner, null),
    keyProblem: secretsUnavailableReason()
  }
}

// The masked form needs the last four characters of the key. They are read from the encrypted value, never stored
// apart, so the mask costs one decryption on the admin page and nothing elsewhere.
function decryptForMask(stored: string): string {
  try {
    return decryptSecret(stored, KEY_CONTEXT)
  } catch {
    // A key that no longer decrypts (SECRETS_ENCRYPTION_KEY changed) shows as an unknown key, not an error page.
    return '????'
  }
}

function readCount(value: unknown, name: string, max: number): number {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1 || number > max) {
    throw createError({ statusCode: 400, message: `${name} must be a whole number from 1 to ${max}.` })
  }
  return number
}

/** Saves the admin's changes. Only the fields sent change. */
export async function saveSprocketInstance(patch: SprocketInstancePatch, userId: string): Promise<void> {
  const existing = await storedRow()
  const update: Partial<typeof instanceSettings.$inferInsert> = { updatedAt: Date.now(), updatedBy: userId }

  if (patch.forEveryone !== undefined) update.sprocketForEveryone = Boolean(patch.forEveryone)
  if (patch.model !== undefined) {
    const model = patch.model.trim()
    if (!model || model.length > 200) throw createError({ statusCode: 400, message: 'Send the model id, e.g. openai/gpt-4o-mini.' })
    update.sprocketModel = model
  }
  if (patch.userDailyLimit !== undefined) update.sprocketUserDailyLimit = readCount(patch.userDailyLimit, 'The per-user daily limit', MAX_DAILY)
  if (patch.instanceDailyCap !== undefined) update.sprocketInstanceDailyCap = readCount(patch.instanceDailyCap, 'The instance daily cap', MAX_DAILY)
  if (patch.defaultManner !== undefined) {
    if (!isSprocketManner(patch.defaultManner)) {
      throw createError({ statusCode: 400, message: `The manner is one of ${SPROCKET_MANNERS.join(', ')}.` })
    }
    update.sprocketDefaultManner = patch.defaultManner
  }

  if (patch.apiKey !== undefined) {
    const trimmed = typeof patch.apiKey === 'string' ? patch.apiKey.trim() : ''
    if (!trimmed) {
      update.sprocketOpenrouterKey = null
    } else {
      if (trimmed.length > 500) throw createError({ statusCode: 400, message: 'That does not look like an OpenRouter key.' })
      // Encrypting throws 503 with the reason when SECRETS_ENCRYPTION_KEY is not set, so no key is kept in clear.
      update.sprocketOpenrouterKey = encryptSecret(trimmed, KEY_CONTEXT)
    }
  }

  const base = {
    id: SPROCKET_INSTANCE_ROW_ID,
    crewsAllowed: existing?.crewsAllowed ?? false,
    rateLimits: existing?.rateLimits ?? null,
    updatedAt: Date.now(),
    updatedBy: userId
  }
  await db.insert(instanceSettings)
    .values({ ...base, ...update })
    .onConflictDoUpdate({ target: instanceSettings.id, set: update })
}

/** The instance's OpenRouter key and model when Sprocket for everyone is on and a key is stored, else null. */
export async function instanceSprocketKey(): Promise<{ apiKey: string, model: string } | null> {
  const row = await storedRow()
  if (!row?.sprocketForEveryone || !row.sprocketOpenrouterKey) return null
  return { apiKey: decryptSecret(row.sprocketOpenrouterKey, KEY_CONTEXT), model: row.sprocketModel }
}

/** The UTC day a count belongs to, as its first millisecond. */
export function utcDayStart(now = Date.now()): number {
  const d = new Date(now)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** When the counts reset: the next UTC midnight. */
export function nextReset(now = Date.now()): Date {
  return new Date(utcDayStart(now) + 86_400_000)
}

/** Adds one to a counter for the day when it is below `limit`. Returns false, and changes nothing, when it is at the limit. */
async function bump(scope: string, limit: number, day: number): Promise<boolean> {
  const [row] = await db.insert(rateLimitHits)
    .values({ id: genId(), scope, windowStart: day, hits: 1 })
    .onConflictDoUpdate({
      target: [rateLimitHits.scope, rateLimitHits.windowStart],
      set: { hits: sql`${rateLimitHits.hits} + 1` },
      setWhere: sql`${rateLimitHits.hits} < ${limit}`
    })
    .returning({ hits: rateLimitHits.hits })
  return Boolean(row)
}

async function unbump(scope: string, day: number): Promise<void> {
  await db.update(rateLimitHits)
    .set({ hits: sql`${rateLimitHits.hits} - 1` })
    .where(sql`${rateLimitHits.scope} = ${scope} and ${rateLimitHits.windowStart} = ${day}`)
}

/**
 * Counts one Sprocket message of `userId` on the instance key. Throws 429 with the reset time when the user has used
 * the daily limit, or the instance has used its daily cap. Atomic: the count only moves when it is under the limit.
 */
export async function reserveInstanceMessage(userId: string): Promise<void> {
  const row = await storedRow()
  const userLimit = row?.sprocketUserDailyLimit ?? 200
  const cap = row?.sprocketInstanceDailyCap ?? 2000
  const day = utcDayStart()
  const reset = nextReset().toISOString()

  if (!(await bump(INSTANCE_SCOPE, cap, day))) {
    throw createError({ statusCode: 429, message: `Sprocket has answered its daily maximum for the whole instance. It resets at ${reset} (midnight UTC).` })
  }
  const userScope = `sprocket:user:${userId}`
  if (!(await bump(userScope, userLimit, day))) {
    await unbump(INSTANCE_SCOPE, day)
    throw createError({ statusCode: 429, message: `You have used your ${userLimit} Sprocket messages for today. They reset at ${reset} (midnight UTC).` })
  }
}

/** How many Sprocket messages a user has used today on the instance key. */
export async function instanceMessagesToday(userId: string): Promise<number> {
  const [row] = await db.select({ hits: rateLimitHits.hits }).from(rateLimitHits)
    .where(sql`${rateLimitHits.scope} = ${`sprocket:user:${userId}`} and ${rateLimitHits.windowStart} = ${utcDayStart()}`)
  return row?.hits ?? 0
}

/**
 * Which key answers a Sprocket message. The user's own key always wins and is never counted here. Without one, the
 * instance key answers when it is on, and the message is counted against the user's daily limit and the instance cap.
 */
export async function chooseOpenRouterAnswer(
  own: { apiKey: string, model: string } | null,
  userId: string
): Promise<{ apiKey: string, model: string, by: 'own-key' | 'instance-key' } | null> {
  if (own) return { ...own, by: 'own-key' }
  const instance = await instanceSprocketKey()
  if (!instance) return null
  await reserveInstanceMessage(userId)
  return { ...instance, by: 'instance-key' }
}
