import { inArray, eq } from 'drizzle-orm'
import { db } from '../db'
import { organization, projects } from '../db/schema'
import { customerIdsOf } from '../utils/auth-helpers'
import { sharedPairsOf } from '../utils/customerProjects'
import { guestProjectIdsOf } from '../utils/guests'
import { sharedProjectIds } from '../utils/sharedProjectIds'
import { groupKey, SHARED_FALLBACK_LABEL } from '#shared/utils/sharedGroups'
import { INVITATION_COOKIE } from '../utils/customers'

// The projects shared with the signed-in person: the projects of the customers they are a contact of, and the
// boards they hold as a guest. Grouped by what shares them (a customer, or the team a board belongs to), and named
// by its organisation. The list page says so when there is nothing yet.
type Group = { key: string, label: string, projects: { id: string, name: string }[] }

export default defineEventHandler(async (event) => {
  const userId = event.context.session.user.id
  const customerIds = await customerIdsOf(userId)
  const guestIds = await guestProjectIdsOf(userId)

  const groups = new Map<string, Group>()
  const seen = new Set<string>()

  if (customerIds.length) {
    const rows = await sharedPairsOf(customerIds)

    for (const row of rows) {
      const key = groupKey('customer', row.customerId)
      const group = groups.get(key) ?? { key, label: row.organizationName, projects: [] }
      group.projects.push({ id: row.projectId, name: row.projectName })
      groups.set(key, group)
      seen.add(row.projectId)
    }
  }

  // The boards held as a guest, once each, under the team they belong to (a personal board has none).
  const guestOnly = sharedProjectIds([], guestIds).filter(id => !seen.has(id))
  if (guestOnly.length) {
    const rows = await db
      .select({
        projectId: projects.id,
        projectName: projects.name,
        teamId: projects.teamId,
        organizationName: organization.name
      })
      .from(projects)
      .leftJoin(organization, eq(organization.id, projects.teamId))
      .where(inArray(projects.id, guestOnly))

    for (const row of rows) {
      const key = groupKey('team', row.teamId ?? 'none')
      const group = groups.get(key) ?? { key, label: row.organizationName ?? SHARED_FALLBACK_LABEL, projects: [] }
      group.projects.push({ id: row.projectId, name: row.projectName })
      groups.set(key, group)
    }
  }

  // `contact`: the person is a customer contact or a guest of some board, shared or not yet (the projects page uses it).
  // `inviteToken`: an invitation link opened here and not yet accepted (its cookie), so the projects page can return to it.
  const inviteToken = getCookie(event, INVITATION_COOKIE) ?? null
  return { groups: [...groups.values()], contact: customerIds.length > 0 || guestIds.length > 0, inviteToken }
})
