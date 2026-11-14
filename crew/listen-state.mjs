// The state file of the listen loop (.listen/<who>.json): what the loop has already seen. A file that was written by
// hand, cut short or left from an older kit may lack a list or hold the wrong shape. Each list is read as empty (and the
// flag as false) instead of crashing the loop, so one bad file does not stop Susy, Pia or a worker from listening.

/** The state in the shape the loop uses, whatever the raw value holds. */
export function normalizeListenState(raw) {
  const source = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    ...source,
    joined: source.joined === true,
    notes: Array.isArray(source.notes) ? source.notes.filter(id => typeof id === 'string') : [],
    tasks: source.tasks !== null && typeof source.tasks === 'object' && !Array.isArray(source.tasks) ? source.tasks : null
  }
}

/** The state from the text of a state file. A file that is not JSON at all reads as an empty state. */
export function parseListenState(text) {
  try {
    return normalizeListenState(JSON.parse(text))
  } catch {
    return normalizeListenState(null)
  }
}
