// The session read, kept for a short window (Speed, step E). The app start reads the session from several places (the route
// middleware, two plugins and the settings plugin), and each read was a request of its own. A read inside the window reuses
// the first answer. A failed read is not kept. forget() drops the answer, for the login page, so a sign-in is seen at once.
// The server still checks every protected request, so a window that outlives a session only shows the old state for a moment.

export const SESSION_TTL_MS = 30_000

export function createSessionCache<S>(read: () => Promise<S>, now: () => number = Date.now, ttl: number = SESSION_TTL_MS) {
  let entry: { at: number, promise: Promise<S> } | null = null
  return {
    get(): Promise<S> {
      const at = now()
      if (entry && at - entry.at < ttl) return entry.promise
      const promise = read().catch((error: unknown) => {
        entry = null
        throw error
      })
      entry = { at, promise }
      return promise
    },
    forget() {
      entry = null
    }
  }
}
