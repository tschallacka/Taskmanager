import { and, count, desc, eq, isNotNull, isNull } from 'drizzle-orm'
import { db } from '../../db'
import { notifications, projectGuestInvitations, projectTasks, projects, user } from '../../db/schema'

// The signed-in person's inbox, newest first, and how many of it are unread. The inbox leaves out what was
// archived; `box=read` lists the Read box instead (the archived ones). The unread count is the inbox's only.
export default defineEventHandler(async (event) => {
  const userId = event.context.session.user.id
  const query = getQuery(event)
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200)
  const inReadBox = query.box === 'read'
  const inInbox = inReadBox ? isNotNull(notifications.archivedAt) : isNull(notifications.archivedAt)

  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      projectId: notifications.projectId,
      projectName: projects.name,
      taskId: notifications.taskId,
      taskTitle: projectTasks.title,
      messageId: notifications.messageId,
      title: notifications.title,
      body: notifications.body,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
      actorName: user.name,
      actorImage: user.image,
      // For a guest request: what became of it, so the inbox offers Approve and Decline only while it waits.
      invitationId: notifications.invitationId,
      invitationStatus: projectGuestInvitations.status,
      invitationEmail: projectGuestInvitations.email
    })
    .from(notifications)
    .innerJoin(projects, eq(projects.id, notifications.projectId))
    .leftJoin(projectTasks, eq(projectTasks.id, notifications.taskId))
    .leftJoin(projectGuestInvitations, eq(projectGuestInvitations.id, notifications.invitationId))
    .leftJoin(user, eq(user.id, notifications.actorId))
    .where(and(eq(notifications.userId, userId), inInbox, query.unread === '1' ? isNull(notifications.readAt) : undefined))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)

  const [unread] = await db
    .select({ total: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), isNull(notifications.archivedAt)))

  return { unread: Number(unread?.total ?? 0), items: rows }
})
