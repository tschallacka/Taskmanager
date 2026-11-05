// Keys made before the board picker stored what they reach in the key row itself: one workspace
// (api_keys.team_id, NULL for the personal workspace) or one board (api_keys.project_id). This moves
// each such key to the reach tables, so it keeps reaching exactly what it reached before. A key is
// marked board_reach_set once it is moved, so a key the owner later edits is never moved again, even
// when it ends up with no boards. Idempotent; runs on every start.
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { apiKeys, apiKeyBoards, apiKeyWorkspaces } from '../db/schema'
import { genId } from './projects'

export interface ReachMigrationCount {
  keys: number
}

export async function migrateApiKeyReach(): Promise<ReachMigrationCount> {
  const count: ReachMigrationCount = { keys: 0 }
  const legacy = await db.select({ id: apiKeys.id, teamId: apiKeys.teamId, projectId: apiKeys.projectId })
    .from(apiKeys)
    .where(eq(apiKeys.boardReachSet, false))

  for (const key of legacy) {
    await db.transaction(async (tx) => {
      const now = Date.now()
      if (key.projectId) {
        await tx.insert(apiKeyBoards)
          .values({ id: genId(), keyId: key.id, projectId: key.projectId, createdAt: now })
          .onConflictDoNothing()
      } else {
        // A NULL team is the personal workspace; there is no unique index to lean on, so check first.
        const [existing] = await tx.select({ id: apiKeyWorkspaces.id }).from(apiKeyWorkspaces)
          .where(eq(apiKeyWorkspaces.keyId, key.id))
          .limit(1)
        if (!existing) {
          await tx.insert(apiKeyWorkspaces).values({ id: genId(), keyId: key.id, teamId: key.teamId, createdAt: now })
        }
      }
      await tx.update(apiKeys).set({ boardReachSet: true }).where(eq(apiKeys.id, key.id))
    })
    count.keys += 1
  }
  return count
}
