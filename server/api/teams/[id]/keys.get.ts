import { desc, eq, inArray } from 'drizzle-orm'
import { db } from '../../../db'
import { apiKeys, customers, projects, user } from '../../../db/schema'
import { requireTeamRole } from '../../../utils/auth-helpers'

/**
 * Every API key that works in this team, whoever made it: what it is limited to, who owns
 * it and when it was last used. Owners and admins only; no key or part of its secret is shown.
 */
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  await requireTeamRole(event, teamId)

  const rows = await db
    .select({ key: apiKeys, ownerName: user.name, ownerEmail: user.email })
    .from(apiKeys)
    .innerJoin(user, eq(user.id, apiKeys.userId))
    .where(eq(apiKeys.teamId, teamId))
    .orderBy(desc(apiKeys.createdAt))

  const customerIds = [...new Set(rows.flatMap(row => (row.key.customerId ? [row.key.customerId] : [])))]
  const projectIds = [...new Set(rows.flatMap(row => (row.key.projectId ? [row.key.projectId] : [])))]
  const customerNames = new Map(customerIds.length
    ? (await db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, customerIds))).map(c => [c.id, c.name])
    : [])
  const projectNames = new Map(projectIds.length
    ? (await db.select({ id: projects.id, name: projects.name }).from(projects).where(inArray(projects.id, projectIds))).map(p => [p.id, p.name])
    : [])

  return {
    keys: rows.map(({ key, ownerName, ownerEmail }) => ({
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      scopes: key.scopes,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt,
      owner: { id: key.userId, name: ownerName, email: ownerEmail },
      limit: key.projectId
        ? { type: 'project' as const, id: key.projectId, name: projectNames.get(key.projectId) ?? 'a board' }
        : key.customerId
          ? { type: 'customer' as const, id: key.customerId, name: customerNames.get(key.customerId) ?? 'a customer' }
          : { type: 'team' as const, id: teamId, name: null }
    }))
  }
})
