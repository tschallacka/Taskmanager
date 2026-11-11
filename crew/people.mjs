// `crew people add`: the merge of the new people's keys into the crew home's creds.json (card mw9m0rwynhwj8y2odd).
// Only the people the route answered with a key are taken; an entry already in creds.json is never overwritten, and
// the file is written in one step (a temporary file in the same folder, then a rename), mode 0600.
import { renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** The new people in a route answer: those with a password and an API key. Anyone else is left out. */
export function newPeopleOf(answer) {
  const people = answer?.people && typeof answer.people === 'object' ? answer.people : {}
  const out = {}
  for (const [key, person] of Object.entries(people)) {
    if (typeof person?.password === 'string' && typeof person?.apiKey === 'string') {
      out[key] = { email: person.email, password: person.password, apiKey: person.apiKey }
    }
  }
  return out
}

/**
 * Adds the answer's new people to a copy of creds. The old entries stay as they are, including any entry that has the
 * same key. Returns the merged copy and the keys it added, in order.
 */
export function mergeNewPeople(creds, answer) {
  const merged = { ...creds, people: { ...(creds?.people ?? {}) } }
  const added = []
  for (const [key, person] of Object.entries(newPeopleOf(answer))) {
    if (Object.hasOwn(merged.people, key)) continue
    merged.people[key] = person
    added.push(key)
  }
  return { creds: merged, added: added.sort() }
}

/** Writes creds to file as JSON in one step: a temporary file beside it, then a rename. Mode 0600 throughout. */
export function writeCredsAtomic(file, creds) {
  const temp = join(dirname(file), `.${Date.now().toString(36)}-${process.pid}.tmp`)
  try {
    writeFileSync(temp, `${JSON.stringify(creds, null, 2)}\n`, { mode: 0o600 })
    renameSync(temp, file)
  } catch (error) {
    rmSync(temp, { force: true })
    throw error
  }
}
