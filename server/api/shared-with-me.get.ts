import { inArray, eq } from 'drizzle-orm'
import { db } from '../db'
import { customers, organization, projects } from '../db/schema'
import { customerIdsOf } from '../utils/auth-helpers'

// The projects shared with the signed-in person as a customer contact, grouped by customer. A customer contact
// sees only these; the list page says so when there is nothing yet.
export default defineEventHandler(async (event) => {
  const userId = event.context.session.user.id
  const customerIds = await customerIdsOf(userId)
  if (!customerIds.length) return { groups: [] }

  const rows = await db
    .select({
      projectId: projects.id,
      projectName: projects.name,
      customerId: customers.id,
      customerName: customers.name,
      organizationName: organization.name
    })
    .from(projects)
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .innerJoin(organization, eq(organization.id, customers.organizationId))
    .where(inArray(projects.customerId, customerIds))

  const groups = new Map<string, { customerName: string, organizationName: string, projects: { id: string, name: string }[] }>()
  for (const row of rows) {
    const group = groups.get(row.customerId) ?? { customerName: row.customerName, organizationName: row.organizationName, projects: [] }
    group.projects.push({ id: row.projectId, name: row.projectName })
    groups.set(row.customerId, group)
  }
  return { groups: [...groups.values()] }
})
