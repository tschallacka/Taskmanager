// The person keys were renamed: workers w1..w4 became wren, wick, wynn and wade, the usability tester
// pietje became usher, the project manager pm became pia and the code reviewer nitpicker became nina.
// A crew home made before that has the old keys in creds.json, in the people and nicks of crew.json,
// and in the files named for a person (profiles/<key>, channel-<key>.state.json, .listen/<key>.json).
// This moves them to the new keys, once, and does nothing when there is nothing left to move.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

export const RENAMED_KEYS = { w1: 'wren', w2: 'wick', w3: 'wynn', w4: 'wade', pietje: 'usher', pm: 'pia', nitpicker: 'nina' }

/** A copy of the object with old person keys renamed. When both the old and the new key are there, the new one wins. */
export function renameKeys(object) {
  if (!object || typeof object !== 'object') return object
  const out = {}
  for (const [key, value] of Object.entries(object)) {
    const next = RENAMED_KEYS[key] ?? key
    if (next !== key && Object.hasOwn(object, next)) continue
    out[next] = value
  }
  return out
}

/** Renames the old person keys in the crew home's creds.json and in the files named for a person. */
export function migrateCrewHome(dir) {
  const credsFile = `${dir}/creds.json`
  if (existsSync(credsFile)) {
    try {
      const creds = JSON.parse(readFileSync(credsFile, 'utf8'))
      if (creds.people && Object.keys(creds.people).some(key => key in RENAMED_KEYS)) {
        creds.people = renameKeys(creds.people)
        writeFileSync(credsFile, `${JSON.stringify(creds, null, 2)}\n`, { mode: 0o600 })
      }
    } catch {
      // A creds.json that does not parse is reported by whoever reads it next.
    }
  }
  for (const [from, to] of Object.entries(RENAMED_KEYS)) {
    for (const path of [`profiles/${from}`, `channel-${from}.state.json`, `.listen/${from}.json`]) {
      const target = path.replace(from, to)
      if (existsSync(`${dir}/${path}`) && !existsSync(`${dir}/${target}`)) renameSync(`${dir}/${path}`, `${dir}/${target}`)
    }
  }
}
