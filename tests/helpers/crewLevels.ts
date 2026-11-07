// Test helper: switches the three levels of the crew permission on for a team and its boards, and off again.
// Crews are off by default, so a test that attaches a crew to a board turns the levels on first.
import { eq } from 'drizzle-orm'
import { db } from '../../server/db'
import { instanceSettings } from '../../server/db/schema'
import { setBoardCrews, setInstanceCrews, setTeamCrews } from '../../server/utils/crewPermission'

/** The instance, the team and each of the boards allow crews. `adminId` is recorded as who switched the instance on. */
export async function allowCrews(adminId: string | null, teamId: string, boardIds: string[]): Promise<void> {
  await setInstanceCrews(true, adminId)
  await setTeamCrews(teamId, true)
  for (const boardId of boardIds) await setBoardCrews(boardId, true)
}

/** Takes the instance level off the test database again. */
export async function clearCrewLevels(): Promise<void> {
  await db.delete(instanceSettings).where(eq(instanceSettings.id, 'instance'))
}
