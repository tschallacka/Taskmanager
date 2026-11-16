import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db'
import { customerInvitations, customerProjects, projects } from '../db/schema'
import { genId } from './projects'
import { INVITATION_TTL_MS, newInvitationToken } from './customers'

// Shares projects with a customer: one row per project in customer_projects (a project may be shared with several
// customers). projects.customerId is set only where it is empty, so the first customer a project was filed under stays.
export async function shareProjectsWith(customerId: string, projectIds: string[], now: number): Promise<void> {
  for (const projectId of projectIds) {
    await db.insert(customerProjects).values({ id: genId(), customerId, projectId, createdAt: now }).onConflictDoNothing()
    await db.update(projects).set({ customerId })
      .where(and(eq(projects.id, projectId), isNull(projects.customerId)))
  }
}

// The Share path's write, in one step: the email invitation is made first, and only then the project is shared with the
// customer. If the invitation cannot be made, the project stays where it was (Nina's S1).
export async function fileAndInvite(input: { projectId: string, customerId: string, email: string, actorId: string, now: number }) {
  const { token, tokenHash } = newInvitationToken()
  const [invitation] = await db.insert(customerInvitations).values({
    id: genId(),
    customerId: input.customerId,
    tokenHash,
    label: null,
    email: input.email,
    createdBy: input.actorId,
    createdAt: input.now,
    expiresAt: input.now + INVITATION_TTL_MS
  }).returning()
  await shareProjectsWith(input.customerId, [input.projectId], input.now)
  return { id: invitation!.id, token, expiresAt: invitation!.expiresAt }
}
