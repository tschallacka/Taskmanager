// A project shared with several customers (customer_projects): each customer sees it, the first customer stays on
// projects.customerId, and a project filed before the join table (projects.customerId only) is still shared. Needs the
// test database with the customer_projects table. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_wynn node --import tsx --test tests/customer-projects-db.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { customers, organization, projects, user } = schema
const { shareProjectsWith } = await import('../server/utils/projectCustomerInvite')
const { projectsOfCustomers, projectsSharedWith, sharedCustomerIdsOf, sharedPairsOf } = await import('../server/utils/customerProjects')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `cpj-${tag}-${name}`
const now = Date.now()
const owner = id('owner')
const team = id('team')
const board = id('board')
const legacy = id('legacy')
const plain = id('plain')
const first = id('first')
const second = id('second')
const users = [owner]

before(async () => {
  const at = new Date(now)
  await db.insert(user).values({ id: owner, name: owner, email: `${owner}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(organization).values({ id: team, name: 'Shared team', slug: team, createdAt: at })
  await db.insert(customers).values([
    { id: first, organizationId: team, name: 'First customer', createdAt: now, updatedAt: now },
    { id: second, organizationId: team, name: 'Second customer', createdAt: now, updatedAt: now }
  ])
  await db.insert(projects).values([
    { id: board, userId: owner, teamId: team, name: 'Shared board', createdAt: now, updatedAt: now },
    { id: legacy, userId: owner, teamId: team, name: 'Legacy board', customerId: first, createdAt: now, updatedAt: now },
    { id: plain, userId: owner, teamId: team, name: 'Plain board', createdAt: now, updatedAt: now }
  ])
})

after(async () => {
  await db.delete(projects).where(inArray(projects.id, [board, legacy, plain]))
  await db.delete(customers).where(inArray(customers.id, [first, second]))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(user).where(inArray(user.id, users))
  await db.$client.end()
})

test('a project shared with two customers is visible to both, and the first customer stays on projects.customerId', async () => {
  await shareProjectsWith(first, [board], now)
  await shareProjectsWith(second, [board], now)
  await shareProjectsWith(second, [board], now) // a repeat is one row, not two

  const [row] = await db.select({ customerId: projects.customerId }).from(projects).where(eq(projects.id, board))
  assert.equal(row!.customerId, first)

  const forFirst = (await projectsSharedWith(first)).map(project => project.id)
  const forSecond = (await projectsSharedWith(second)).map(project => project.id)
  assert.ok(forFirst.includes(board))
  assert.ok(forSecond.includes(board))
  assert.equal(forSecond.filter(projectId => projectId === board).length, 1)
})

test('the visibility filter reaches the project through either customer, and not through a customer it is not shared with', async () => {
  const visibleTo = async (customerIds: string[]) => {
    const rows = await db.select({ id: projects.id }).from(projects).where(projectsOfCustomers(customerIds))
    return rows.map(row => row.id)
  }
  assert.ok((await visibleTo([second])).includes(board))
  assert.ok((await visibleTo([first])).includes(board))
  assert.equal((await visibleTo([id('nobody')])).includes(board), false)
})

test('the pairs of a customer list give each shared project once per customer', async () => {
  const pairs = await sharedPairsOf([first, second])
  const boardPairs = pairs.filter(pair => pair.projectId === board)
  assert.equal(boardPairs.length, 2)
  assert.deepEqual(boardPairs.map(pair => pair.customerId).sort(), [first, second].sort())
})

test('a project filed before the join table is still shared with its customer', async () => {
  assert.ok((await projectsSharedWith(first)).map(project => project.id).includes(legacy))
  const pairs = await sharedPairsOf([first])
  assert.ok(pairs.some(pair => pair.projectId === legacy && pair.customerId === first))
})

test('a project lists every customer it is shared with, once each', async () => {
  assert.deepEqual([...(await sharedCustomerIdsOf(board))].sort(), [first, second].sort())
  assert.deepEqual(await sharedCustomerIdsOf(legacy), [first])
  assert.deepEqual(await sharedCustomerIdsOf(plain), [])
})

test('a project shared with no customer is shared with none', async () => {
  assert.equal((await projectsSharedWith(second)).map(project => project.id).includes(plain), false)
  assert.equal((await sharedPairsOf([first, second])).some(pair => pair.projectId === plain), false)
  assert.deepEqual(await sharedPairsOf([]), [])
})
