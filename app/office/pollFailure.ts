// What a failed poll of a board's office means on the page. Pure, so the rule that a board the viewer cannot
// see gets no room is tested without a browser. The server answers 404 for an unseen board, and 404 with the
// reason "no-crew" for a board nobody works on; both are 404, so the reason is read first.
export type PollFailure = { kind: 'unseen' } | { kind: 'no-crew' } | { kind: 'retry' }

export function pollFailureOf(error: unknown): PollFailure {
  const e = error as { statusCode?: number, data?: { data?: { reason?: string } } } | null
  if (e?.data?.data?.reason === 'no-crew') return { kind: 'no-crew' }
  if (e?.statusCode === 404) return { kind: 'unseen' }
  return { kind: 'retry' }
}

// How many unseen 404s in a row take a board's room away. One can come from a deploy or a route gap.
const UNSEEN_AFTER = 2

/** The count of unseen 404s in a row after one more failed poll. Any other answer starts the count again. */
export function unseenAfter(strikes: number, failure: PollFailure): { strikes: number, unseen: boolean } {
  if (failure.kind !== 'unseen') return { strikes: 0, unseen: false }
  const next = strikes + 1
  return { strikes: next, unseen: next >= UNSEEN_AFTER }
}

/** The count when polling starts over on a switch between live and demo: no 404 from before counts any more. */
export function strikesOnRestart(): number {
  return 0
}
