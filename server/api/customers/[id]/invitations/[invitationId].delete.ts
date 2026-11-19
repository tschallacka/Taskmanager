import { db } from '../../../../db'
import { customerInvitations } from '../../../../db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { requireCustomer } from '../../../../utils/customers'

// Revokes a link that has not been used yet: it stops working (the invite page and accept refuse it), and the row stays
// with its revokedAt for the record. A link that is used or already revoked is left as it is.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const invitationId = getRouterParam(event, 'invitationId')!
  const { customer } = await requireCustomer(event, id, { manage: true })

  await db
    .update(customerInvitations)
    .set({ revokedAt: Date.now() })
    .where(and(
      eq(customerInvitations.id, invitationId),
      eq(customerInvitations.customerId, customer.id),
      isNull(customerInvitations.acceptedAt),
      isNull(customerInvitations.revokedAt)
    ))
  return { ok: true }
})
