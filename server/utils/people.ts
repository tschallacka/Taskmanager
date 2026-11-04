// Who a project's tasks can be assigned to: its organisation's members, plus
// the contacts of its customer, or only its owner when it is a personal board.
import { asc, eq } from 'drizzle-orm'
import { db } from '../db'
import { customerMembers, member, projectGuests, user } from '../db/schema'
import type { GuestRole } from '../db/schema'

export interface ProjectPerson {
  id: string
  name: string
  email: string
  image: string | null
  // A guest is an outside reader like a customer's contact: it reads what is not private.
  kind: 'staff' | 'customer'
  /** Set for a guest of the board, so the lists can say so. */
  guestRole?: GuestRole
}

export async function projectPeople(project: { id?: string, userId: string, teamId: string | null, customerId: string | null }): Promise<ProjectPerson[]> {
  const columns = { id: user.id, name: user.name, email: user.email, image: user.image }

  const staff = project.teamId
    ? await db.select(columns).from(member).innerJoin(user, eq(user.id, member.userId))
        .where(eq(member.organizationId, project.teamId)).orderBy(asc(user.name))
    : await db.select(columns).from(user).where(eq(user.id, project.userId))

  const contacts = project.customerId
    ? await db.select(columns).from(customerMembers).innerJoin(user, eq(user.id, customerMembers.userId))
        .where(eq(customerMembers.customerId, project.customerId)).orderBy(asc(user.name))
    : []

  // Callers that only know the board's owner and team pass no id and get no guests.
  const guests = project.id
    ? await db.select({ ...columns, guestRole: projectGuests.role }).from(projectGuests)
        .innerJoin(user, eq(user.id, projectGuests.userId))
        .where(eq(projectGuests.projectId, project.id)).orderBy(asc(user.name))
    : []

  const staffIds = new Set(staff.map(p => p.id))
  const contactIds = new Set(contacts.map(p => p.id))
  return [
    ...staff.map(p => ({ ...p, kind: 'staff' as const })),
    ...contacts.filter(p => !staffIds.has(p.id)).map(p => ({ ...p, kind: 'customer' as const })),
    ...guests
      .filter(p => !staffIds.has(p.id) && !contactIds.has(p.id))
      .map(p => ({ ...p, kind: 'customer' as const }))
  ]
}

/** 400 unless the account can be given work on this project. */
export async function requireAssignable(
  project: { id?: string, userId: string, teamId: string | null, customerId: string | null },
  userId: string
) {
  const people = await projectPeople(project)
  if (!people.some(p => p.id === userId)) {
    throw createError({ statusCode: 400, message: 'That person is not on this project' })
  }
}
