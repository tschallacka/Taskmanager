// Branding on Instance settings: the app name and the logo shown next to it. Both are stored on the instance row
// (instance_settings), and null means the defaults: "Taskmanager" and the logo that ships with the app
// (public/logo.svg). Reset puts the defaults back. The public read is what the login page shows before anyone signs in.
import { eq } from 'drizzle-orm'
import { createError } from 'h3'
import { db } from '../db'
import { instanceSettings } from '../db/schema'
import { SPROCKET_INSTANCE_ROW_ID } from './sprocketInstance'

export const DEFAULT_BRAND_NAME = 'Taskmanager'
const MAX_NAME_LENGTH = 40
// An uploaded logo is a small icon. A larger file is refused rather than stored.
const MAX_LOGO_BYTES = 100_000

export interface BrandPublic {
  name: string
  /** A data: URL of the uploaded logo, or null for the logo that ships with the app. */
  logoSrc: string | null
}

export interface BrandAdminView {
  /** The name as it is shown (the default when none is set). */
  name: string
  /** The name the admin typed, or null while the default is in use. */
  customName: string | null
  /** Whether an uploaded logo is in use. */
  customLogo: boolean
}

async function storedRow() {
  const [row] = await db.select().from(instanceSettings).where(eq(instanceSettings.id, SPROCKET_INSTANCE_ROW_ID))
  return row ?? null
}

export function logoDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export async function brandPublic(): Promise<BrandPublic> {
  const row = await storedRow()
  return {
    name: row?.brandName || DEFAULT_BRAND_NAME,
    logoSrc: row?.brandLogoSvg ? logoDataUrl(row.brandLogoSvg) : null
  }
}

export async function brandAdminView(): Promise<BrandAdminView> {
  const row = await storedRow()
  return {
    name: row?.brandName || DEFAULT_BRAND_NAME,
    customName: row?.brandName || null,
    customLogo: Boolean(row?.brandLogoSvg)
  }
}

/** The name as typed: trimmed, one line, at most 40 characters. An empty name is refused, the reset is the way back. */
export function readBrandName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  const oneLine = [...name].every((char) => {
    const code = char.charCodeAt(0)
    return code >= 32 && code !== 127
  })
  if (!name || name.length > MAX_NAME_LENGTH || !oneLine) {
    throw createError({ statusCode: 400, message: `The app name is one line of 1 to ${MAX_NAME_LENGTH} characters.` })
  }
  return name
}

/**
 * An uploaded logo must be a plain SVG image. It is shown through an <img> tag, where a script cannot run, but the
 * file is still refused when it carries anything an image has no business with: scripts, embedded pages, event
 * handlers, links to other files or other sites, and entity declarations.
 */
export function sanitizeLogoSvg(value: unknown): string {
  const svg = typeof value === 'string' ? value.trim() : ''
  if (!svg || Buffer.byteLength(svg, 'utf8') > MAX_LOGO_BYTES) {
    throw createError({ statusCode: 400, message: `The logo is an SVG file of at most ${MAX_LOGO_BYTES / 1000} KB.` })
  }
  const looksLikeSvg = /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(svg) && /<\/svg>\s*$/i.test(svg)
  const refused = [
    /<\s*script/i,
    /<\s*foreignObject/i,
    /<\s*(iframe|object|embed|link|meta|style)\b/i,
    /<!\s*(DOCTYPE|ENTITY)/i,
    /\son[a-z]+\s*=/i,
    /javascript:/i,
    /@import/i,
    // A reference to another file or site. Only a reference inside the image itself (a fragment) is allowed.
    /\b(href|src)\s*=\s*(?!["']?#)/i,
    /url\(\s*(?!["']?#)/i
  ]
  if (!looksLikeSvg || refused.some(pattern => pattern.test(svg))) {
    throw createError({ statusCode: 400, message: 'That file is not a plain SVG logo. Scripts, links to other files and embedded pages are not allowed.' })
  }
  return svg
}

/** Saves the admin's branding. Only the fields sent change; null resets a field to its default. */
export async function saveBrand(patch: { name?: unknown, logoSvg?: unknown }, userId: string): Promise<void> {
  const existing = await storedRow()
  const update: Partial<typeof instanceSettings.$inferInsert> = { updatedAt: Date.now(), updatedBy: userId }
  if (patch.name !== undefined) update.brandName = patch.name === null ? null : readBrandName(patch.name)
  if (patch.logoSvg !== undefined) update.brandLogoSvg = patch.logoSvg === null ? null : sanitizeLogoSvg(patch.logoSvg)

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
