import { desc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { apiKeys } from '../../db/schema'
import { openBoardsOf, reachViewsOf, workspacesOf } from '../../utils/keyReach'

/**
 * The caller's API keys, whichever workspace they were made in, each with what it reaches. A key made
 * in a team is listed too, but only the team page changes it (`editable` is false). The workspaces and
 * boards the caller may pick from come with the list, the boards grouped by their workspace name.
 */
export default defineEventHandler(async (event) => {
  const userId = event.context.session.user.id

  const rows = await db.select().from(apiKeys).where(eq(apiKeys.userId, userId)).orderBy(desc(apiKeys.createdAt))
  const [views, workspaces, boards] = await Promise.all([
    reachViewsOf(rows),
    workspacesOf(userId),
    openBoardsOf(userId)
  ])
  const workspaceName = new Map(workspaces.map(workspace => [workspace.id, workspace.name]))

  return {
    workspaces: [{ id: null, name: 'Personal' }, ...workspaces],
    boards: boards.map(board => ({
      id: board.id,
      name: board.name,
      teamId: board.teamId,
      workspace: board.teamId ? workspaceName.get(board.teamId) ?? 'Team' : 'Personal'
    })),
    keys: rows.map((key) => {
      const view = views.get(key.id)
      return {
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        scopes: key.scopes,
        createdAt: key.createdAt,
        lastUsedAt: key.lastUsedAt,
        expiresAt: key.expiresAt,
        teamId: key.teamId,
        teamName: key.teamId ? workspaceName.get(key.teamId) ?? 'a team' : null,
        editable: key.teamId === null,
        allBoards: view?.allBoards ?? false,
        workspaces: view?.workspaces ?? [],
        boards: view?.boards ?? []
      }
    })
  }
})
