import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db'
import { customerInvitations, customerMembers, customers } from '../db/schema'
import { addressesOfUser } from '../utils/extraEmails'
import { genId } from '../utils/projects'
import { tiedInviteIsAcceptable } from '../utils/customerInviteRules'
import { guestProjectIdsOf } from '../utils/guests'
import { sharedProjectIds } from '../utils/sharedProjectIds'
import { projectsSharedWith } from '../utils/customerProjects'

// Accepts one pending invitation from the pending-invitations page: it must be tied to one of the signed-in account's
// addresses, open and unexpired. The account becomes a contact of that customer.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ id?: string }>(event)
  const id = body?.id ?? ''
  if (!id) throw createError({ statusCode: 400, message: 'Choose the invitation to accept.' })

  const addresses = await addressesOfUser(event.context.session.user.id)
  const [row] = await db
    .select({ id: customerInvitations.id, email: customerInvitations.email, acceptedAt: customerInvitations.acceptedAt, revokedAt: customerInvitations.revokedAt, expiresAt: customerInvitations.expiresAt, customerId: customerInvitations.customerId })
    .from(customerInvitations)
    .where(eq(customerInvitations.id, id))
  const now = Date.now()
  if (!row || !tiedInviteIsAcceptable(row, addresses, now)) {
    throw createError({ statusCode: 410, message: 'This invitation is no longer valid' })
  }

  // Claimed in one statement, so two requests cannot both take it.
  const [claimed] = await db
    .update(customerInvitations)
    .set({ acceptedBy: event.context.session.user.id, acceptedAt: now })
    .where(and(eq(customerInvitations.id, id), isNull(customerInvitations.acceptedAt)))
    .returning({ customerId: customerInvitations.customerId })
  if (!claimed) throw createError({ statusCode: 410, message: 'This invitation is no longer valid' })

  await db.insert(customerMembers).values({ id: genId(), customerId: claimed.customerId, userId: event.context.session.user.id, createdAt: now }).onConflictDoNothing()
  const [customer] = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, claimed.customerId))
  // Where it lands (see utils/inviteLanding): the one project, or the shared list.
  const customerShared = await projectsSharedWith(claimed.customerId)
  const guestShared = await guestProjectIdsOf(event.context.session.user.id)
  return {
    ok: true,
    customerName: customer?.name ?? null,
    sharedProjectIds: sharedProjectIds(customerShared.map(project => project.id), guestShared)
  }
})
