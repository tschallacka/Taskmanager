import { eq } from 'drizzle-orm'
import { db } from '../db'
import { customers } from '../db/schema'
import { customerIdsOf } from './auth-helpers'
import { teamIdsOf } from './api-keys'
import type { SprocketRunPerson } from './sprocketRun'

/**
 * Whom a Sprocket run acts for. A person who belongs to a team is staff and runs in the personal workspace, with the
 * reach they have. A contact of a customer, with no team of their own, runs limited to that customer, in the
 * customer's team, as a customer key does. A contact of several customers gets the first one (the same single-customer
 * limit a customer key has).
 */
export async function sprocketPersonOf(userId: string): Promise<SprocketRunPerson> {
  const teams = await teamIdsOf(userId)
  if (teams.length) return { userId, teamId: null }

  const [customerId] = await customerIdsOf(userId)
  if (!customerId) return { userId, teamId: null }
  const [customer] = await db.select({ organizationId: customers.organizationId }).from(customers).where(eq(customers.id, customerId))
  if (!customer) return { userId, teamId: null }
  return { userId, teamId: customer.organizationId, customerId }
}
