import { and, eq, gt, inArray, sql } from 'drizzle-orm'
import { db } from '../db'
import { customerInvitations, customers, organization } from '../db/schema'
import { addressesOfUser } from '../utils/extraEmails'
import { customerInvitesToClaim } from '../utils/customerInviteRules'

// The open invitations tied to the signed-in account's addresses that it has not accepted yet. Each one shows with
// Accept invitation on the pending-invitations page (the page accepts it by id, after this check).
export default defineEventHandler(async (event) => {
  const addresses = await addressesOfUser(event.context.session.user.id)
  if (!addresses.length) return { invitations: [] }
  const now = Date.now()
  const lowered = addresses.map(address => address.toLowerCase())

  const rows = await db
    .select({
      id: customerInvitations.id,
      email: customerInvitations.email,
      acceptedAt: customerInvitations.acceptedAt,
      expiresAt: customerInvitations.expiresAt,
      customerName: customers.name,
      organizationName: organization.name
    })
    .from(customerInvitations)
    .innerJoin(customers, eq(customers.id, customerInvitations.customerId))
    .innerJoin(organization, eq(organization.id, customers.organizationId))
    .where(and(
      gt(customerInvitations.expiresAt, now),
      inArray(sql`lower(${customerInvitations.email})`, lowered)
    ))

  const open = new Set(customerInvitesToClaim(rows, addresses, now))
  return {
    invitations: rows
      .filter(row => open.has(row.id))
      .map(row => ({ id: row.id, customerName: row.customerName, organizationName: row.organizationName }))
  }
})
