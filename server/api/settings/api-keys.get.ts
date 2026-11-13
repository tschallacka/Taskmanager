import { desc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { apiKeys } from '../../db/schema'
import { openBoardsOf, reachViewsOf, reachedBoardsOf, workspacesOf } from '../../utils/keyReach'
import { backfillSuffixes } from '../../../shared/utils/keyNameSuffix'

/**
 * The caller's API keys, whichever workspace they were made in, each with what it reaches. A key made
 * in a team is listed too, but only the team page changes it (`editable` is false). The workspaces and
 * boards the caller may pick from come with the list, the boards grouped by their workspace name.
 */
export default defineEventHandler(async (event) => {
  const userId = event.context.session.user.id

  const rows = await db.select().from(apiKeys).where(eq(apiKeys.userId, userId)).orderBy(desc(apiKeys.createdAt))
  // Keys made before the suffix was stored get theirs now, once, oldest first, and it is kept (keyNameSuffix.ts).
  const filled = backfillSuffixes(rows)
  for (const [id, suffix] of Object.entries(filled)) {
    await db.update(apiKeys).set({ nameSuffix: suffix }).where(eq(apiKeys.id, id))
  }
  const [views, workspaces, boards, reached] = await Promise.all([
    reachViewsOf(rows),
    workspacesOf(userId),
    openBoardsOf(userId),
    reachedBoardsOf(userId, rows)
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
        nameSuffix: key.nameSuffix ?? filled[key.id] ?? '',
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
        boards: view?.boards ?? [],
        reachedBoards: reached.get(key.id) ?? []
      }
    })
  }
})
