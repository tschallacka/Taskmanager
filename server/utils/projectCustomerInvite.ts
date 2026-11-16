import { eq } from 'drizzle-orm'
import { db } from '../db'
import { customerInvitations, projects } from '../db/schema'
import { genId } from './projects'
import { INVITATION_TTL_MS, newInvitationToken } from './customers'

// The Share path's write, in one step: the email invitation is made first, and only then the project is filed under the
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
  await db.update(projects).set({ customerId: input.customerId }).where(eq(projects.id, input.projectId))
  return { id: invitation!.id, token, expiresAt: invitation!.expiresAt }
}
