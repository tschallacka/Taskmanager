// The crew home folder: where a crew's creds.json, crew.json and documents live on the machine that runs
// it. The Owner types it once per crew; the browser remembers it. It is never sent to the server.

/** The folder the commands use until the Owner types another one. */
export function guessCrewHome(slug: string): string {
  return `~/crew-home/${slug}`
}

const SHELL_SAFE_HOME = /^(~|\/)[^\s'"`$;&|<>\\()*?[\]{}!#]*$/

/** The folder as typed, trimmed and without a trailing slash, or null when a terminal cannot take it as written. */
export function normalizeCrewHome(text: string): string | null {
  let home = text.trim()
  while (home.length > 1 && home.endsWith('/')) home = home.slice(0, -1)
  if (!home || home === '~' || !SHELL_SAFE_HOME.test(home)) return null
  return home
}

function storageKey(slug: string): string {
  return `taskmanager.crewHome.${slug}`
}

/** The folder remembered for this crew in this browser, or null. A blocked store reads as nothing remembered. */
export function readCrewHome(slug: string): string | null {
  try {
    const stored = localStorage.getItem(storageKey(slug))
    return stored ? normalizeCrewHome(stored) : null
  } catch {
    return null
  }
}

/** Remembers the folder for this crew. Returns false when the browser would not keep it. */
export function writeCrewHome(slug: string, home: string): boolean {
  try {
    localStorage.setItem(storageKey(slug), home)
    return true
  } catch {
    return false
  }
}

/** The form a folder takes inside a command that is pasted into a shell with a shell's $HOME, as in a heredoc. */
export function shellCrewHome(home: string): string {
  return home.startsWith('~/') ? `$HOME/${home.slice(2)}` : home
}
