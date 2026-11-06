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
