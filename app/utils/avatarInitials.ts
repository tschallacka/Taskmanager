// The initials of a person without a picture, on a background colour picked from their id. The colour is the same for the
// same id everywhere and on every visit, and every palette colour carries readable text (WCAG contrast 4.5:1 or better),
// in light and dark mode alike. Pure, so every avatar draws the same way from this one module.

/** A fixed palette of about twelve mid-tone colours; the text on each is chosen by contrast (see textOn). */
export const AVATAR_PALETTE = [
  '#0f766e', '#1d4ed8', '#7c3aed', '#a21caf', '#be185d', '#b91c1c',
  '#c2410c', '#a16207', '#4d7c0f', '#15803d', '#0e7490', '#475569'
] as const

/** A relative luminance of an sRGB colour (WCAG). */
export function luminance(hex: string): number {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

/** The WCAG contrast ratio of two colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** White or near-black text, whichever reads better on the background. */
export function textOn(background: string): string {
  return contrast(background, '#ffffff') >= contrast(background, '#111111') ? '#ffffff' : '#111111'
}

/** A 32-bit FNV-1a hash of a string: the same input always gives the same number. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** The background colour for a user id: stable, from the palette. */
export function colourFor(userId: string): string {
  return AVATAR_PALETTE[hash(userId) % AVATAR_PALETTE.length]!
}

/**
 * One or two letters: the first letter of the first and last word of the name, else the first letter of the name, else
 * the first letter of the email address. Upper case; a name with no letters falls through to the email.
 */
export function initialsOf(name: string | null | undefined, email: string | null | undefined): string {
  const words = String(name ?? '').trim().split(/\s+/).filter(word => /\p{L}/u.test(word))
  if (words.length >= 2) return (firstLetter(words[0]!) + firstLetter(words.at(-1)!)).toUpperCase()
  if (words.length === 1) return firstLetter(words[0]!).toUpperCase()
  const local = String(email ?? '').split('@')[0] ?? ''
  return firstLetter(local).toUpperCase() || '?'
}

function firstLetter(word: string): string {
  return word.match(/\p{L}/u)?.[0] ?? ''
}
