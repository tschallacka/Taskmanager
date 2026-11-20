// The Share path's write: a project is filed under a customer and an email invitation is made in one step; when the
// invitation cannot be made, the project is not filed. Needs the test database with the email column. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_wynn node --import tsx --test tests/share-customer-invite-db.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { customerInvitations, customers, organization, projects, user } = schema
const { fileAndInvite } = await import('../server/utils/projectCustomerInvite')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `shr-${tag}-${name}`
const now = Date.now()
const owner = id('owner')
const team = id('team')
const board = id('board')
const customer = id('customer')
const email = `${id('person')}@guest.test`
const users = [owner]

before(async () => {
  const at = new Date(now)
  await db.insert(user).values({ id: owner, name: owner, email: `${owner}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(organization).values({ id: team, name: 'Share team', slug: team, createdAt: at })
  await db.insert(customers).values({ id: customer, organizationId: team, name: 'Share customer', createdAt: now, updatedAt: now })
  await db.insert(projects).values({ id: board, userId: owner, teamId: team, name: 'Share board', createdAt: now, updatedAt: now })
})

after(async () => {
  const rows = await db.select({ id: customerInvitations.id }).from(customerInvitations).where(eq(customerInvitations.customerId, customer))
  if (rows.length) await db.delete(customerInvitations).where(inArray(customerInvitations.id, rows.map(row => row.id)))
  await db.delete(projects).where(eq(projects.id, board))
  await db.delete(customers).where(eq(customers.id, customer))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(user).where(inArray(user.id, users))
  await db.$client.end()
})

test('the project is filed under the customer and the email invitation is made', async () => {
  const made = await fileAndInvite({ projectId: board, customerId: customer, email, actorId: owner, now })
  const [project] = await db.select().from(projects).where(eq(projects.id, board))
  assert.equal(project!.customerId, customer)
  const [row] = await db.select().from(customerInvitations).where(eq(customerInvitations.id, made.id))
  assert.equal(row!.email, email)
  assert.equal(row!.customerId, customer)
})

test('a project already filed under another customer is filed under the new one, and the first customer keeps it', async () => {
  const { projectCountsByCustomer, projectsSharedWith } = await import('../server/utils/customerProjects')
  const first = id('first')
  const second = id('second')
  const moved = id('moved')
  await db.insert(customers).values([
    { id: first, organizationId: team, name: 'First customer', createdAt: now, updatedAt: now },
    { id: second, organizationId: team, name: 'Second customer', createdAt: now, updatedAt: now }
  ])
  await db.insert(projects).values({ id: moved, userId: owner, teamId: team, name: 'Moved board', customerId: first, createdAt: now, updatedAt: now })
  await fileAndInvite({ projectId: moved, customerId: second, email, actorId: owner, now })
  const [project] = await db.select().from(projects).where(eq(projects.id, moved))
  assert.equal(project!.customerId, second, 'the project is filed under the customer the Share dialog picked')
  assert.deepEqual((await projectsSharedWith(first)).map(row => row.id), [moved], 'the first customer keeps the project')
  assert.equal((await projectCountsByCustomer([second])).get(second), 1, 'the new customer counts the project')
  await db.delete(customerInvitations).where(eq(customerInvitations.customerId, second))
  await db.delete(projects).where(eq(projects.id, moved))
  await db.delete(customers).where(inArray(customers.id, [first, second]))
})

test('when the invitation cannot be made, the project is not filed', async () => {
  const [before] = await db.select().from(projects).where(eq(projects.id, board))
  await assert.rejects(fileAndInvite({ projectId: board, customerId: 'no-such-customer', email, actorId: owner, now }))
  const [after] = await db.select().from(projects).where(eq(projects.id, board))
  assert.equal(after!.customerId, before!.customerId)
})
