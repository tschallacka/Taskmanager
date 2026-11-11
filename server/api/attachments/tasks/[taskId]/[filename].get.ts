import { join, extname } from 'path'
import { existsSync, readFileSync } from 'fs'
import { db } from '#server/db'
import { customerMembers, projects, projectTasks } from '#server/db/schema'
import { and, eq } from 'drizzle-orm'
import { auth } from '#server/lib/auth'
import { isTeamMember } from '#server/utils/auth-helpers'
import { isStaffOfShadowedBoard } from '#server/utils/crewBoardAccess'
import { hiddenCrewShadows, isCrewShadow } from '#server/utils/boardTree'
import { guestRowOf } from '#server/utils/guests'
import { ATTACHMENT_MIME, SAFE_FILENAME, SAFE_ID, taskAttachmentDir } from '#server/utils/attachments'

// Serves an image uploaded into a task description. Readable by whoever can
// read the task: its board's owner or team, a contact of the board's customer
// when the task is shared with customers, or anyone while the board is shared
// publicly — the public board page renders the same shared descriptions.
export default defineEventHandler(async (event) => {
  const taskId = getRouterParam(event, 'taskId')
  const filename = getRouterParam(event, 'filename')

  if (!taskId || !filename || !SAFE_ID.test(taskId) || !SAFE_FILENAME.test(filename)) {
    throw createError({ statusCode: 400, message: 'Invalid path' })
  }

  const [row] = await db
    .select({
      projectId: projects.id,
      userId: projects.userId,
      teamId: projects.teamId,
      customerId: projects.customerId,
      isPublic: projects.isPublic,
      publicUntil: projects.publicUntil,
      visibility: projectTasks.visibility
    })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .where(eq(projectTasks.id, taskId))

  if (!row) throw createError({ statusCode: 404, message: 'Not found' })

  const sharedWithCustomers = row.visibility === 'customer'
  // A crew's shadow board is never served by link (isCrewShadow): its files go to the crew rule only.
  const crewShadow = await isCrewShadow(row.projectId)
  const isPublic = sharedWithCustomers && row.isPublic && (!row.publicUntil || row.publicUntil > Date.now()) && !crewShadow
  if (!isPublic) {
    const session = await auth.api.getSession({ headers: event.headers })
    const userId = session?.user.id
    // A crew shadow the person may not see (hiddenCrewShadows), or anyone with no session, gets no files: 404, as if it
    // did not exist. The one rule is applied here, once, for every route into the files.
    const hiddenShadow = crewShadow && (userId === undefined || (await hiddenCrewShadows(userId, [row.projectId])).has(row.projectId))
    if (hiddenShadow) throw createError({ statusCode: 404, message: 'Not found' })
    const allowed = userId !== undefined && (
      userId === row.userId
      || (row.teamId ? await isTeamMember(userId, row.teamId) : false)
      || (sharedWithCustomers && row.customerId ? await isCustomerContact(userId, row.customerId) : false)
      // A guest of the board reads what is not marked private, like a customer's contact.
      || (sharedWithCustomers && Boolean(await guestRowOf(row.projectId, userId)))
      // The staff of a real board read the shadow board its crew keeps in another team.
      || await isStaffOfShadowedBoard(userId, row.projectId)
    )

    if (!allowed) throw createError({ statusCode: 403, message: 'Forbidden' })
  }

  const filePath = join(taskAttachmentDir(taskId), filename)
  if (!existsSync(filePath)) throw createError({ statusCode: 404, message: 'Not found' })

  setHeader(event, 'Content-Type', ATTACHMENT_MIME[extname(filename).toLowerCase()] ?? 'application/octet-stream')
  const maxAge = row.publicUntil
    ? Math.max(0, Math.floor((row.publicUntil - Date.now()) / 1000))
    : 31_536_000
  setHeader(event, 'Cache-Control', isPublic ? `public, max-age=${maxAge}` : 'private, no-store')

  return readFileSync(filePath)
})

async function isCustomerContact(userId: string, customerId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: customerMembers.id })
    .from(customerMembers)
    .where(and(eq(customerMembers.userId, userId), eq(customerMembers.customerId, customerId)))
  return Boolean(row)
}
