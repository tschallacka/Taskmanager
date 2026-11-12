// The rules for a profile picture and a display name (pure, no database): what kind of file and how big, what an SVG may
// contain, whether someone may change a profile, and how a display name is trimmed and checked. The upload route calls
// these before it stores anything, and the display-name route before it writes.

export const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024
export const NAME_MIN = 1
export const NAME_MAX = 60

/** The problem with an uploaded picture by its type and size, or null when it may be stored. */
export function uploadProblem(input: { type: string, bytes: number }): string | null {
  if (!(AVATAR_TYPES as readonly string[]).includes(input.type)) return 'A picture must be a PNG, JPEG, WebP or SVG file.'
  if (!(input.bytes > 0)) return 'The picture is empty.'
  if (input.bytes > AVATAR_MAX_BYTES) return 'A picture must be 2 MB or smaller.'
  return null
}

/**
 * The problem with an SVG picture, or null when it is safe to show. No script, no event handlers, no javascript: links,
 * no external references (a URL that is not inside the file), no embedded HTML or foreign objects.
 */
export function svgProblem(svg: string): string | null {
  const text = String(svg ?? '')
  if (!/^\s*(<\?xml[^>]*>\s*)?(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(text)) return 'This is not an SVG picture.'
  if (/<\s*script/i.test(text)) return 'An SVG picture may not contain a script.'
  if (/\son[a-z]+\s*=/i.test(text)) return 'An SVG picture may not contain event handlers.'
  if (/javascript\s*:/i.test(text)) return 'An SVG picture may not contain javascript: links.'
  if (/<\s*(foreignObject|iframe|object|embed)/i.test(text)) return 'An SVG picture may not embed other content.'
  if (/(href|src)\s*=\s*["']\s*(https?:|\/\/)/i.test(text)) return 'An SVG picture may not reference anything outside the file.'
  if (/@import|url\(\s*["']?\s*(https?:|\/\/)/i.test(text)) return 'An SVG picture may not load anything from outside the file.'
  return null
}

/** Only the person themselves may change their name or picture. A manager or an admin may not. */
export function mayChangeProfile(actorId: string | null | undefined, profileUserId: string): boolean {
  return Boolean(actorId) && actorId === profileUserId
}

/** A display name, trimmed, or the problem with it. */
export function displayNameOf(raw: unknown): { name: string } | { problem: string } {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (name.length < NAME_MIN) return { problem: 'A name must have at least one character.' }
  if (name.length > NAME_MAX) return { problem: `A name must be ${NAME_MAX} characters or fewer.` }
  return { name }
}
