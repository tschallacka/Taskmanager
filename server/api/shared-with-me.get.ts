import { inArray, eq } from 'drizzle-orm'
import { db } from '../db'
import { customers, organization, projects } from '../db/schema'
import { customerIdsOf } from '../utils/auth-helpers'
import { guestProjectIdsOf } from '../utils/guests'
import { sharedProjectIds } from '../utils/sharedProjectIds'

// The projects shared with the signed-in person: the projects of the customers they are a contact of, and the
// boards they hold as a guest. Grouped by the organisation that shares them. The list page says so when there is
// nothing yet.
type Group = { label: string, projects: { id: string, name: string }[] }
// A board held as a guest with no team behind it (a personal board) has no organisation to name it after.
const PERSONAL_SHARE_LABEL = 'Shared with you'

export default defineEventHandler(async (event) => {
  const userId = event.context.session.user.id
  const customerIds = await customerIdsOf(userId)
  const guestIds = await guestProjectIdsOf(userId)

  const groups = new Map<string, Group>()
  const seen = new Set<string>()

  if (customerIds.length) {
    const rows = await db
      .select({
        projectId: projects.id,
        projectName: projects.name,
        customerId: customers.id,
        organizationName: organization.name
      })
      .from(projects)
      .innerJoin(customers, eq(customers.id, projects.customerId))
      .innerJoin(organization, eq(organization.id, customers.organizationId))
      .where(inArray(projects.customerId, customerIds))

    for (const row of rows) {
      const group = groups.get(`customer:${row.customerId}`) ?? { label: row.organizationName, projects: [] }
      group.projects.push({ id: row.projectId, name: row.projectName })
      groups.set(`customer:${row.customerId}`, group)
      seen.add(row.projectId)
    }
  }

  // The boards held as a guest, once each, under the organisation of their team (a personal board has none).
  const guestOnly = sharedProjectIds([], guestIds).filter(id => !seen.has(id))
  if (guestOnly.length) {
    const rows = await db
      .select({
        projectId: projects.id,
        projectName: projects.name,
        organizationName: organization.name
      })
      .from(projects)
      .leftJoin(organization, eq(organization.id, projects.teamId))
      .where(inArray(projects.id, guestOnly))

    for (const row of rows) {
      const key = `guest:${row.organizationName ?? 'shared'}`
      const group = groups.get(key) ?? { label: row.organizationName ?? PERSONAL_SHARE_LABEL, projects: [] }
      group.projects.push({ id: row.projectId, name: row.projectName })
      groups.set(key, group)
    }
  }

  return { groups: [...groups.values()] }
})
