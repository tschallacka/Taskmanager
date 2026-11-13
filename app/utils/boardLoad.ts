// The board page's load failures (Boss, the spinner card): a request that never completes or a board the reader cannot
// open shows a sentence, never a spinner that spins forever. Pure, so the store, the page and a test use one rule.

// A board id is letters and digits only (the page and the store both check it with this rule).
export function isBoardId(id: string): boolean {
  return /^[a-z0-9]+$/i.test(id)
}

// How long a board request may take before the page gives up and says so.
export const BOARD_LOAD_TIMEOUT_MS = 60_000

// The sentence a failed board load shows. A bad id, a board the reader cannot open (403, or 404 for a board that is
// gone), and any other failure, including a request that timed out.
export function boardLoadMessage(input: { invalidId?: boolean, status?: number | null }): string {
  if (input.invalidId) return 'This is not a valid board link.'
  if (input.status === 403 || input.status === 404) return 'You do not have access to this board or it does not exist.'
  return 'This board could not be loaded.'
}

// The board load error the store holds: what failed, and the sentence for it.
export interface BoardLoadError {
  status: number | null
  invalidId: boolean
  message: string
}

export type BoardLoadEvent
  = | { type: 'fail', status?: number | null, invalidId?: boolean }
    | { type: 'retry' }
    | { type: 'loaded' }

// The next load error after an event: a failure sets it, a retry (the board loads again) and a load that succeeds clear it.
export function boardLoadStateAfter(_prev: BoardLoadError | null, event: BoardLoadEvent): BoardLoadError | null {
  if (event.type !== 'fail') return null
  const status = event.status ?? null
  const invalidId = event.invalidId ?? false
  return { status, invalidId, message: boardLoadMessage({ invalidId, status }) }
}

// Rejects when the promise has not settled in time, so a request that never completes is a failure, not a spinner.
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
