// The typed board for the Crews page's "Set up a crew" button (card mwdd5q94mmq78py1ntp, option b): the instance admin types
// the board's id and name, and the prompt is built from them. Pure, so the check is tested without the page.

const BOARD_ID = /^[A-Za-z0-9_-]{4,64}$/
const MAX_NAME = 120

/** The one sentence to show when the typed board is not usable, or null when it is. */
export function setupBoardProblem(input: { boardId: string, boardName: string }): string | null {
  const id = input.boardId.trim()
  const name = input.boardName.trim()
  if (!id) return 'Type the board id first.'
  if (!BOARD_ID.test(id)) return 'A board id is letters, digits, dashes and underscores, 4 to 64 characters.'
  if (!name) return 'Type the board name too.'
  if (name.length > MAX_NAME) return `The board name is at most ${MAX_NAME} characters.`
  return null
}
