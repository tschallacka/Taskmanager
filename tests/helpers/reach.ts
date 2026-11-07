/** The reach a test gives a key: Select all, or the workspaces and boards it picks. */
export function reachOf(pick: { all?: boolean, workspaces?: (string | null)[], boards?: string[] } = {}) {
  return { allBoards: pick.all ?? false, workspaceTeamIds: pick.workspaces ?? [], boardIds: pick.boards ?? [] }
}
