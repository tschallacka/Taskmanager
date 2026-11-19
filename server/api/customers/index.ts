import { db } from '../../db'
import { customerMembers, customers } from '../../db/schema'
import { asc, count, eq, inArray } from 'drizzle-orm'
import { genId } from '../../utils/projects'
import { requireOrgStaff } from '../../utils/customers'
import { projectCountsByCustomer } from '../../utils/customerProjects'
import { publishFromEvent } from '../../utils/realtime'

// The active organisation's customers. Any staff member can read them, since
// filing a project under a customer is everyday work; adding one is for owners
// and admins.
export default defineEventHandler(async (event) => {
  if (event.method === 'GET') {
    const { organizationId, canManage } = await requireOrgStaff(event)
    const rows = await db
      .select()
      .from(customers)
      .where(eq(customers.organizationId, organizationId))
      .orderBy(asc(customers.name))
    if (!rows.length) return { canManage, customers: [] }

    const ids = rows.map(c => c.id)
    // Counted through the join table as well as projects.customerId (a project may sit under several customers).
    const projectsOf = await projectCountsByCustomer(ids)
    const contactCounts = await db
      .select({ customerId: customerMembers.customerId, total: count() })
      .from(customerMembers)
      .where(inArray(customerMembers.customerId, ids))
      .groupBy(customerMembers.customerId)

    const contactsOf = new Map(contactCounts.map(r => [r.customerId, Number(r.total)]))
    return {
      canManage,
      customers: rows.map(c => ({
        ...c,
        projectCount: projectsOf.get(c.id) ?? 0,
        contactCount: contactsOf.get(c.id) ?? 0
      }))
    }
  }

  if (event.method !== 'POST') {
    throw createError({ statusCode: 405, message: 'Method not allowed' })
  }

  const { organizationId } = await requireOrgStaff(event, { manage: true })
  const body = await readBody<{ name?: string }>(event)
  const name = body.name?.trim()
  if (!name) throw createError({ statusCode: 400, message: 'A customer needs a name' })

  const now = Date.now()
  const [customer] = await db.insert(customers).values({
    id: genId(),
    organizationId,
    name: name.slice(0, 120),
    createdAt: now,
    updatedAt: now
  }).returning()

  await publishFromEvent(event, { type: 'projects' })
  return { ...customer!, projectCount: 0, contactCount: 0 }
})
