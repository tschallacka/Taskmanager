// The defaults crew.json gets for "reader" and "devServers" when the crew does not set them, from the keys of the crew's
// people (creds.json's people, the crew's own keys). The reader is pia when she is one of the people, else the first key.
// Each person's dev server gets a port: the reader at 3100, then the others in order from 3101. A field that is already
// set is never changed. Setup writes these into crew.json when it makes the crew; init fills in what is missing.

export const DEV_SERVER_BASE = 3100

/** The reader and the dev server ports for a crew's people (their keys, in order). */
export function crewDefaults(personKeys) {
  const keys = [...personKeys]
  const reader = keys.includes('pia') ? 'pia' : (keys[0] ?? null)
  const ordered = reader ? [reader, ...keys.filter(key => key !== reader)] : []
  const devServers = {}
  ordered.forEach((key, index) => {
    devServers[key] = DEV_SERVER_BASE + index
  })
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
