// What the expanded API key row shows. A key opens to its read-only view: each board it reaches links to that
// board, by name and workspace, and a crew's read-only board says so. The edit form, with its ticked boxes, opens
// only when its owner asks to change the key, and never on opening the row.

export interface ReachedBoardView {
  id: string
  name: string
  workspace: string
  readOnly: boolean
}

export interface ReachedBoardLink extends ReachedBoardView {
  to: string
}

/** The address a board's name links to, and the boards in the order the list gives them. */
export function reachBoardLinks(boards: ReachedBoardView[]): ReachedBoardLink[] {
  return boards.map(board => ({ ...board, to: `/projects/${board.id}` }))
}

/** `read` until the owner asks to change the key; `edit` only for an owner's personal key that is being changed. */
export function keyPanelMode(key: { editable: boolean }, editing: unknown): 'read' | 'edit' {
  return key.editable && editing ? 'edit' : 'read'
}
