// The defaults crew.json gets for "reader" and "devServers" when the crew does not set them, from the keys of the crew's
// people (creds.json's people, the crew's own keys). The reader is pia when she is one of the people, else the first key.
// Each person's dev server port comes from SERVE_PORTS below. For the four workers (wren, wick, wynn, wade) those ports are
// the ones the crew's serve script (bin/devserver-worker.sh) gives them; the script has no entry for the other keys, so
// their ports are the crew's defaults. A key outside the table gets the next free port from 3109, in order. A field that
// is already set is never changed. Setup writes these into crew.json when it makes the crew; init fills in what is missing.

// Pia's reader port, then the workers, then the others. Keep the four worker entries in step with devserver-worker.sh.
export const SERVE_PORTS = { pia: 3100, wren: 3101, wick: 3102, wynn: 3103, wade: 3104, quincy: 3105, usher: 3106, pat: 3107, nina: 3108 }
export const NEXT_FREE_PORT = 3109

/** The reader and the dev server ports for a crew's people (their keys, in order). */
export function crewDefaults(personKeys) {
  const keys = [...personKeys]
  const reader = keys.includes('pia') ? 'pia' : (keys[0] ?? null)
  const devServers = {}
  let next = NEXT_FREE_PORT
  const taken = new Set(Object.values(SERVE_PORTS))
  for (const key of keys) {
    if (key in SERVE_PORTS) {
      devServers[key] = SERVE_PORTS[key]
    } else {
      while (taken.has(next)) next++
      devServers[key] = next
      taken.add(next)
      next++
    }
  }
  return { reader, devServers }
}

/**
 * The crew.json with the missing defaults filled in: `reader` and `devServers` are set only when the crew has none.
 * Returns the new crew and which fields were added.
 */
export function withCrewDefaults(crew, personKeys) {
  const defaults = crewDefaults(personKeys)
  const next = { ...crew }
  const added = []
  if (!next.reader && defaults.reader) {
    next.reader = defaults.reader
    added.push('reader')
  }
  if (!next.devServers && Object.keys(defaults.devServers).length) {
    next.devServers = defaults.devServers
    added.push('devServers')
  }
  return { crew: next, added }
}
