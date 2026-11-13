// The typed board for the Crews page's "Set up a crew" button (card mwdd5q94mmq78py1ntp, option b): the instance admin types
// the board's id. The server then answers the board's real name, and the prompt uses that name, never the typed text.
// Pure, so the check is tested without the page.

const BOARD_ID = /^[A-Za-z0-9_-]{4,64}$/

/** The one sentence to show when the typed board id is not usable, or null when it is. */
export function setupBoardProblem(input: { boardId: string }): string | null {
  const id = input.boardId.trim()
  if (!id) return 'Type the board id first.'
  if (!BOARD_ID.test(id)) return 'A board id is letters, digits, dashes and underscores, 4 to 64 characters.'
  return null
}
