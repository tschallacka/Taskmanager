// Reads the session from the auth client's store (Speed, step E; Nina's MUST 2). The store makes one get-session request on its
// first subscription. The read resolves with the store's answer once it is no longer pending, and with the store's answer only
// then: if the wait runs out first, it asks the server and resolves with that. A pending value is never the answer, because a
// pending value has no session and would send a signed-in person to /login. `staleAfter` is the answer a previous read (the login
// page) already saw: the read waits for a different one.

export interface SessionValue<S> {
  data: S | null
  error: unknown
  isPending: boolean
}

export interface SessionAnswer<S> {
  data: S | null
  error: unknown
}

export interface StoreView<S> {
  value: () => SessionValue<S>
  onChange: (fn: () => void) => () => void
}

export function readSessionFromStore<S>(
  store: StoreView<S>,
  askServer: () => Promise<SessionAnswer<S>>,
  staleAfter: unknown,
  waitMs: number
): Promise<SessionAnswer<S>> {
  return new Promise<SessionAnswer<S>>((resolve, reject) => {
    let settled = false
    let stop = () => {}
    let timer: ReturnType<typeof setTimeout> | undefined = undefined
    const settle = (answer: SessionAnswer<S>) => {
      if (settled) return
      settled = true
      stop()
      if (timer !== undefined) clearTimeout(timer)
      resolve(answer)
    }
    const usable = (value: SessionValue<S>) => !value.isPending && value !== staleAfter
    const first = store.value()
    if (usable(first)) {
      settle({ data: first.data, error: first.error })
      return
    }
    timer = setTimeout(() => {
      // Still pending, or still the stale answer: the server answers. The store's late answer is ignored once this settled.
      askServer().then(
        answer => settle(answer),
        (error: unknown) => {
          if (settled) return
          settled = true
          stop()
          reject(error)
        }
      )
    }, waitMs)
    stop = store.onChange(() => {
      const value = store.value()
      if (usable(value)) settle({ data: value.data, error: value.error })
    })
  })
}
