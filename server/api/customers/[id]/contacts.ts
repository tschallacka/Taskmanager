import { db } from '../../../db'
import { customerInvitations, customerMembers, user } from '../../../db/schema'
import { and, asc, desc, eq, gt, isNull } from 'drizzle-orm'
import { requireCustomer } from '../../../utils/customers'
import { maskEmails } from '../../../utils/emailPrivacy'

// Who logs in for a customer, and which invitation links are still open.
export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') throw createError({ statusCode: 405, message: 'Method not allowed' })

  const id = getRouterParam(event, 'id')!
  const { customer, canManage } = await requireCustomer(event, id)

  const contacts = await db
    .select({
      userId: customerMembers.userId,
      name: user.name,
      email: user.email,
      createdAt: customerMembers.createdAt
    })
    .from(customerMembers)
    .innerJoin(user, eq(user.id, customerMembers.userId))
    .where(eq(customerMembers.customerId, customer.id))
    .orderBy(asc(user.name))

  // Open links are only of use to whoever may revoke them.
  const invitations = canManage
    ? await db
        .select({
          id: customerInvitations.id,
          label: customerInvitations.label,
          createdAt: customerInvitations.createdAt,
          expiresAt: customerInvitations.expiresAt
        })
        .from(customerInvitations)
        .where(and(
          eq(customerInvitations.customerId, customer.id),
          isNull(customerInvitations.acceptedAt),
          gt(customerInvitations.expiresAt, Date.now())
        ))
        .orderBy(desc(customerInvitations.createdAt))
    : []

  // A contact's address shows only to a reader their owner lets see it. Whoever manages the customer counts as a manager.
  const visible = await maskEmails(
    event.context.session.user.id,
    contacts.map(contact => ({ ...contact, id: contact.userId })),
    { managesBoard: canManage }
  )
  return { canManage, contacts: visible.map(({ id: _id, ...contact }) => contact), invitations }
})
