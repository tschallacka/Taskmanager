// Where the crew's own files live. Shared by config.mjs and browser-driver.mjs, and free of side
// effects, so the driver can import it without a crew.json.
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const kitDir = dirname(fileURLToPath(import.meta.url))

/** A path as one shell word, quoted only when it has to be. Used wherever the kit writes a command for a shell. */
export const shellWord = text => (/^[\w@%+=:,./-]+$/.test(text) ? text : `'${text.replace(/'/g, `'\\''`)}'`)

/**
 * CREW_HOME as an absolute path, or the kit folder when it is unset. A leading ~ is expanded here:
 * a launcher that sets the variable without a shell passes "~/crew-home" on as it is.
 */
export function crewHome(value = process.env.CREW_HOME) {
  if (!value) return kitDir
  return resolve(value === '~' || value.startsWith('~/') ? join(homedir(), value.slice(1)) : value)
}

/** A name as a slug: lower case, accents folded, every run of other characters one dash. The one rule for the kit's names. */
export const slugify = text => String(text).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/** The crew's slug from its crew.json: the crew slug when it has one, else the team name; '' when neither is set. */
export function crewSlugOf(raw) {
  return slugify(raw?.crew?.slug || raw?.team || '')
}

/** A person's session name: the crew slug and the key, such as taskmanager-maintenance-wren. No slug gives the key alone. */
export function sessionNameFor(slug, key) {
  return slug ? `${slug}-${key}` : key
}
