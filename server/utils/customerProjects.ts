import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm'
import { db } from '../db'
import { customerProjects, customers, organization, projects } from '../db/schema'

// Which projects a customer sees. A project can be shared with several customers (the customer_projects join table),
// and the first customer it was filed under, from before the join table existed, is kept on the project row. Both
// count, so a project filed before the join table stays shared with its customer. The rule is read in one place: sharedLinks.

/** SQL: the projects shared with any of the given customers. An empty list matches nothing. */
export function projectsOfCustomers(customerIds: string[]) {
  if (!customerIds.length) return sql`false`
  return or(
    inArray(projects.customerId, customerIds),
    inArray(projects.id, db.select({ id: customerProjects.projectId }).from(customerProjects).where(inArray(customerProjects.customerId, customerIds)))
  )
}

interface SharedLink { projectId: string, customerId: string }

/**
 * The project-customer links, from both sources (the join table and the first-customer column), each once. The scope is the
 * given customers, or the given project. An empty scope matches nothing.
 */
async function sharedLinks(scope: { customerIds: string[] } | { projectId: string }): Promise<SharedLink[]> {
  const byCustomers = 'customerIds' in scope
  if (byCustomers && !scope.customerIds.length) return []
  const firstCustomer = projects.customerId
  const joined = await db
    .select({ projectId: customerProjects.projectId, customerId: customerProjects.customerId })
    .from(customerProjects)
    .where(byCustomers ? inArray(customerProjects.customerId, scope.customerIds) : eq(customerProjects.projectId, scope.projectId))
  const legacy = await db
    .select({ projectId: projects.id, customerId: firstCustomer })
    .from(projects)
    .where(and(
      isNotNull(firstCustomer),
      byCustomers ? inArray(firstCustomer, scope.customerIds) : eq(projects.id, scope.projectId)
    ))
  const links = new Map<string, SharedLink>()
  for (const row of [...joined, ...legacy]) {
    if (row.customerId) links.set(`${row.customerId}:${row.projectId}`, { projectId: row.projectId, customerId: row.customerId })
  }
  return [...links.values()]
}

/** The customers a project is shared with, each once (the join table and the first customer). */
export async function sharedCustomerIdsOf(projectId: string): Promise<string[]> {
  return [...new Set((await sharedLinks({ projectId })).map(link => link.customerId))]
}

/** The projects shared with one customer, each once. */
export async function projectsSharedWith(customerId: string): Promise<{ id: string }[]> {
  const ids = new Set((await sharedLinks({ customerIds: [customerId] })).map(link => link.projectId))
  return [...ids].map(id => ({ id }))
}

export interface SharedPair {
  projectId: string
  projectName: string
  customerId: string
  /** The customer's own name: shown only to that customer's contacts (see customerNames.ts). */
  customerName: string
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
  const links = await sharedLinks({ customerIds })
  if (!links.length) return []
  const [customerRows, projectRows] = await Promise.all([
    db
      .select({ id: customers.id, name: customers.name, organizationName: organization.name })
      .from(customers)
      .innerJoin(organization, eq(organization.id, customers.organizationId))
      .where(inArray(customers.id, customerIds)),
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(inArray(projects.id, [...new Set(links.map(link => link.projectId))]))
  ])
  const customersById = new Map(customerRows.map(row => [row.id, row]))
  const projectsById = new Map(projectRows.map(row => [row.id, row]))
  const pairs: SharedPair[] = []
  for (const link of links) {
    const customer = customersById.get(link.customerId)
    const project = projectsById.get(link.projectId)
    if (!customer || !project) continue
    pairs.push({ projectId: project.id, projectName: project.name, customerId: customer.id, customerName: customer.name, organizationName: customer.organizationName })
  }
  return pairs
}
