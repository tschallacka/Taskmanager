// The instance's name and icon, set by the instance admin (one row, id 'instance'). Read on every request, so a
// change shows without a rebuild. Without a row, the name is the built-in one and the icon is the file in public/.
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { instanceSettings } from '../db/schema'

export const DEFAULT_INSTANCE_NAME = 'Taskmanager'
export const INSTANCE_NAME_MAX = 40
export const ICON_MAX_BYTES = 512 * 1024
const ICON_MIN_SIZE = 512
const ICON_TYPES = ['image/png', 'image/svg+xml']
const INSTANCE_ID = 'instance'
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export interface Branding {
  name: string
  iconMime: string | null
  iconData: string | null
}

/** The name as the instance admin typed it: plain text, short, not empty. Refused with a 400 otherwise. */
export function cleanInstanceName(raw: unknown): string {
  if (typeof raw !== 'string') throw createError({ statusCode: 400, message: 'The name must be text.' })
  const name = raw.replace(/\s+/g, ' ').trim()
  if (!name) throw createError({ statusCode: 400, message: 'The name cannot be empty.' })
  if (name.length > INSTANCE_NAME_MAX) {
    throw createError({ statusCode: 400, message: `The name can be at most ${INSTANCE_NAME_MAX} characters.` })
  }
  if (/[<>]/.test(name) || [...name].some(char => char.charCodeAt(0) < 0x20)) {
    throw createError({ statusCode: 400, message: 'The name is plain text: no angle brackets or control characters.' })
  }
  return name
}

/**
 * The icon as uploaded, checked: a PNG, square and at least 512 by 512, or an SVG with an svg root and no
 * scripts or event handlers. The browser scales it to every size the app shows.
 */
export function checkIcon(mime: unknown, data: unknown): { mime: string, data: string } {
  if (typeof mime !== 'string' || !ICON_TYPES.includes(mime)) {
    throw createError({ statusCode: 400, message: 'The icon must be a PNG or an SVG.' })
  }
  if (typeof data !== 'string' || !data) throw createError({ statusCode: 400, message: 'The icon is empty.' })
  const bytes = Buffer.from(data, 'base64')
  if (!bytes.length || bytes.length > ICON_MAX_BYTES) {
    throw createError({ statusCode: 400, message: 'The icon can be at most 512 KB.' })
  }
  if (mime === 'image/png') {
    const isPng = bytes.length >= 24 && bytes.subarray(0, 8).equals(PNG_SIGNATURE) && bytes.subarray(12, 16).toString('latin1') === 'IHDR'
    if (!isPng) throw createError({ statusCode: 400, message: 'The file is not a PNG.' })
    const width = bytes.readUInt32BE(16)
    const height = bytes.readUInt32BE(20)
    if (width !== height || width < ICON_MIN_SIZE) {
      throw createError({ statusCode: 400, message: `The icon must be square and at least ${ICON_MIN_SIZE} by ${ICON_MIN_SIZE} pixels.` })
    }
  } else {
    const text = bytes.toString('utf8')
    if (!/<svg[\s>]/.test(text) || /<script|\son[a-z]+\s*=|javascript:/i.test(text)) {
      throw createError({ statusCode: 400, message: 'The icon must be an SVG without scripts.' })
    }
  }
  return { mime, data: bytes.toString('base64') }
}

/** The name and icon the instance shows now. */
export async function brandingOf(): Promise<Branding> {
  const [row] = await db.select().from(instanceSettings).where(eq(instanceSettings.id, INSTANCE_ID))
  return {
    name: row?.name || DEFAULT_INSTANCE_NAME,
    iconMime: row?.iconMime ?? null,
    iconData: row?.iconData ?? null
  }
}

/** The name alone, for the texts the server writes: emails, the MCP server's name, the realtime and GitHub texts. */
export async function instanceNameOf(): Promise<string> {
  return (await brandingOf()).name
}

/** Stores a new name and, when given, a new icon. A null icon clears it, back to the built-in one. Instance admin only: the caller checks. */
export async function saveBranding(input: { name: string, icon?: { mime: string, data: string } | null }): Promise<void> {
  const icon = input.icon === undefined ? undefined : input.icon
  const now = new Date()
  const iconSet = icon === undefined ? {} : { iconMime: icon?.mime ?? null, iconData: icon?.data ?? null }
  await db.insert(instanceSettings)
    .values({ id: INSTANCE_ID, name: input.name, ...iconSet, updatedAt: now })
    .onConflictDoUpdate({ target: instanceSettings.id, set: { name: input.name, ...iconSet, updatedAt: now } })
}

/** The built-in name and icon again. */
export async function resetBranding(): Promise<void> {
  await saveBranding({ name: DEFAULT_INSTANCE_NAME, icon: null })
}
