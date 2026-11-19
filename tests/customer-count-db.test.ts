// A project filed under a new customer (the Share dialog's new-customer branch) shows under that customer: it is in the
// customer's projects, and the customer's count counts it, even when the project already sits under another customer.
// Needs the test database with customer_projects. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_wynn node --import tsx --test tests/customer-count-db.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { customerInvitations, customers, organization, projects, user } = schema
const { fileAndInvite } = await import('../server/utils/projectCustomerInvite')
const { projectCountsByCustomer, projectsSharedWith } = await import('../server/utils/customerProjects')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `cc-${tag}-${name}`
const now = Date.now()
const owner = id('owner')
const team = id('team')
const first = id('first')
const board = id('board')
const fresh = id('fresh')

test('the customer count counts a project filed under a new customer, as well as under the first one', async () => {
  const at = new Date(now)
  await db.insert(user).values({ id: owner, name: owner, email: `${owner}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(organization).values({ id: team, name: 'Count team', slug: team, createdAt: at })
  await db.insert(customers).values([
    { id: first, organizationId: team, name: 'First', createdAt: now, updatedAt: now },
    { id: fresh, organizationId: team, name: 'Fresh', createdAt: now, updatedAt: now }
  ])
  await db.insert(projects).values({ id: board, userId: owner, teamId: team, name: 'Count board', customerId: first, createdAt: now, updatedAt: now })
  try {
    // The new-customer branch: the customer exists now, the invitation is made and the project is filed under it.
    await fileAndInvite({ projectId: board, customerId: fresh, email: `${id('person')}@guest.test`, actorId: owner, now })

    const counts = await projectCountsByCustomer([first, fresh])
    assert.equal(counts.get(first), 1, 'the first customer still counts the project')
    assert.equal(counts.get(fresh), 1, 'the new customer counts the project it was filed under')

    const shared = (await projectsSharedWith(fresh)).map(project => project.id)
    assert.ok(shared.includes(board), 'the project lists under the new customer')
  } finally {
    await db.delete(customerInvitations).where(eq(customerInvitations.customerId, fresh))
    await db.delete(projects).where(eq(projects.id, board))
    await db.delete(customers).where(inArray(customers.id, [first, fresh]))
    await db.delete(organization).where(eq(organization.id, team))
    await db.delete(user).where(eq(user.id, owner))
    await db.$client.end()
  }
})
