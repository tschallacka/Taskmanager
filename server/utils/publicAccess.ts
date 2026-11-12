// Everything a shared link is allowed to reach, in one place. A public board
// is readable without a session, so the rule that decides "is this link live
// right now" is written once and used by the HTTP endpoints and by the
// WebSocket handler that lets those readers subscribe to updates.
import { db } from '../db'
import { projects } from '../db/schema'
import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { isCrewShadow } from './boardTree'

/** A share is live while it is switched on and its end date has not passed. */
function liveShare(column: typeof projects.publicUntil) {
  return or(isNull(column), gt(column, Date.now()))
}

export async function findPublicProject(id: string) {
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      // A shared board should look like the board, colours included.
      labelColors: projects.labelColors,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt
    })
    .from(projects)
    .where(and(
      eq(projects.id, id),
      eq(projects.isPublic, true),
      liveShare(projects.publicUntil)
    ))
  // A crew's shadow board is never served by link: the crew rule needs a signed-in person, and a link has none.
  if (!project || await isCrewShadow(id)) return null
  return project
}
