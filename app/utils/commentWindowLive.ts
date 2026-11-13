// The comment window's two live rules (the comments store and the thread use them). Pure: no database, no browser.

export interface WindowSides {
  hasEarlier: boolean
  hasLater: boolean
}

export interface LaterSide extends WindowSides {
  laterCount: number
}

// A comment that arrives while a permalink's window is shown. It is the newest comment, so it goes at the end, but only
// when the later side is fully loaded; otherwise the Show later count goes up and the comment waits behind it. A comment
// already in the window is not added twice and does not count.
export function applyLiveComment<T extends { id: string }>(
  comments: readonly T[],
  state: LaterSide,
  live: T
): { comments: T[], state: LaterSide } {
  if (comments.some(c => c.id === live.id)) return { comments: [...comments], state: { ...state } }
  if (state.hasLater) return { comments: [...comments], state: { ...state, laterCount: state.laterCount + 1 } }
  return { comments: [...comments, live], state: { ...state } }
}

// The activity lines that follow a window, by time: only those between the first and last shown comment. The whole
// thread (no window, or nothing left on either side) shows all of them.
export function activityInWindow<A extends { createdAt: number }>(
  activity: readonly A[],
  shown: readonly { createdAt: number }[],
  sides: WindowSides | null
): A[] {
  if (!sides || (!sides.hasEarlier && !sides.hasLater)) return [...activity]
  if (!shown.length) return []
  const first = shown[0]!.createdAt
  const last = shown[shown.length - 1]!.createdAt
  return activity.filter(a => a.createdAt >= first && a.createdAt <= last)
}
