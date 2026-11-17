import { eq, inArray, or, sql } from 'drizzle-orm'
import { db } from '../db'
import { customerProjects, customers, organization, projects } from '../db/schema'

// Which projects a customer sees. A project can be shared with several customers (the customer_projects join table),
// and projects.customerId is the first customer it was filed under, from before the join table existed. Both count,
// so a project filed before the join table stays shared with its customer.

/** SQL: the projects shared with any of the given customers. An empty list matches nothing. */
export function projectsOfCustomers(customerIds: string[]) {
  if (!customerIds.length) return sql`false`
  return or(
    inArray(projects.customerId, customerIds),
    inArray(projects.id, db.select({ id: customerProjects.projectId }).from(customerProjects).where(inArray(customerProjects.customerId, customerIds)))
  )
}

/** The customers a project is shared with, each once (the join table and projects.customerId). */
export async function sharedCustomerIdsOf(projectId: string): Promise<string[]> {
  const joined = await db.select({ id: customerProjects.customerId }).from(customerProjects).where(eq(customerProjects.projectId, projectId))
  const [legacy] = await db.select({ id: projects.customerId }).from(projects).where(eq(projects.id, projectId))
  const ids = new Set(joined.map(row => row.id))
  if (legacy?.id) ids.add(legacy.id)
  return [...ids]
}

/** The projects shared with one customer, each once. */
export async function projectsSharedWith(customerId: string): Promise<{ id: string }[]> {
  const joined = await db.select({ id: customerProjects.projectId }).from(customerProjects).where(eq(customerProjects.customerId, customerId))
  const legacy = await db.select({ id: projects.id }).from(projects).where(eq(projects.customerId, customerId))
  return [...new Map([...joined, ...legacy].map(row => [row.id, row])).values()]
}

export interface SharedPair {
  projectId: string
  projectName: string
  customerId: string
  organizationName: string
}

/** How many projects each of the given customers has, counting a project shared through the join table and the first customer alike. */
export async function projectCountsByCustomer(customerIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (const pair of await sharedPairsOf(customerIds)) counts.set(pair.customerId, (counts.get(pair.customerId) ?? 0) + 1)
  return counts
}

/** Each project shared with one of the given customers, once per customer, with the customer's organisation. */
export async function sharedPairsOf(customerIds: string[]): Promise<SharedPair[]> {
  if (!customerIds.length) return []
  const joined = await db
    .select({ projectId: projects.id, projectName: projects.name, customerId: customers.id, organizationName: organization.name })
    .from(customerProjects)
    .innerJoin(projects, eq(projects.id, customerProjects.projectId))
    .innerJoin(customers, eq(customers.id, customerProjects.customerId))
    .innerJoin(organization, eq(organization.id, customers.organizationId))
    .where(inArray(customerProjects.customerId, customerIds))
  const legacy = await db
    .select({ projectId: projects.id, projectName: projects.name, customerId: customers.id, organizationName: organization.name })
    .from(projects)
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .innerJoin(organization, eq(organization.id, customers.organizationId))
    .where(inArray(projects.customerId, customerIds))
  const pairs = new Map<string, SharedPair>()
  for (const row of [...joined, ...legacy]) pairs.set(`${row.customerId}:${row.projectId}`, row)
  return [...pairs.values()]
}
