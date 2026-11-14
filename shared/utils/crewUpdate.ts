// The one-line crew update, written in one place. The server writes it into /crew/update.sh (its usage line) and the
// app copies it into the prompt, so the two cannot drift apart.

/**
 * The origin as a plain http(s) URL with a host and an optional port, so it can be written into a shell script inside
 * single quotes. A bracketed IPv6 host ([::1]) is a plain host too. Anything else is refused.
 */
export function crewUpdateOrigin(origin: string): string {
  if (!/^https?:\/\/(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+)(:\d{1,5})?$/.test(origin)) throw new Error(`not a plain origin: ${origin}`)
  return origin
}

/** The command a model runs to update its crew: one line, with the crew home folder in place of <crew home>. */
export function crewUpdateCommand(origin: string): string {
  return `curl -fsSL ${crewUpdateOrigin(origin)}/crew/update.sh | sh -s -- <crew home>`
}
