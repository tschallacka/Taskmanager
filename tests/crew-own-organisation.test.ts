// A crew given a board in its own organisation. Only the crew's own work board and its shadow board are refused;
// any other board of the same team takes the crew. Needs the dev database and the Nuxt aliases:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/crew-own-organisation.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

// Nitro provides createError as a global; the crew code expects it.
Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const { crewBoards, crews, customers, member, organization, projects, user } = await import('../server/db/schema')
const { attachCrew, requireOwnCrew } = await import('../server/utils/crewBoards')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `tco-${tag}-${name}`
const now = Date.now()

const owner = id('owner')
const team = id('team')
const customer = id('customer')
const crew = id('crew')
const board = { work: id('board-work'), second: id('board-second') }
const SAME_MESSAGE = 'A crew\'s own board cannot be given a crew.'

const refusedWith400 = (promise: Promise<unknown>) =>
  assert.rejects(promise, (e: { statusCode?: number, message?: string }) => e.statusCode === 400 && e.message === SAME_MESSAGE)

before(async () => {
  const at = new Date()
  await db.insert(user).values({ id: owner, name: owner, email: `${owner}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(organization).values({ id: team, name: 'Own organisation', slug: team, createdAt: at })
  await db.insert(member).values({ id: id('m1'), organizationId: team, userId: owner, role: 'owner', createdAt: at })
  await db.insert(customers).values({ id: customer, organizationId: team, name: 'Own product', createdAt: now, updatedAt: now })
  await db.insert(projects).values([
    { id: board.work, userId: owner, teamId: team, name: 'Crew work board', createdAt: now, updatedAt: now },
    { id: board.second, userId: owner, teamId: team, name: 'Second board', createdAt: now, updatedAt: now }
  ])
  await db.insert(crews).values({ id: crew, slug: `own-${tag}`, name: 'Own crew', teamId: team, boardId: board.work, customerId: customer, createdBy: owner, createdAt: now })
})

after(async () => {
  await db.delete(crewBoards).where(eq(crewBoards.crewId, crew))
  await db.delete(crews).where(eq(crews.id, crew))
  await db.delete(projects).where(eq(projects.teamId, team))
  await db.delete(customers).where(eq(customers.id, customer))
  await db.delete(member).where(eq(member.organizationId, team))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(user).where(inArray(user.id, [owner]))
  await db.$client.end()
})

test('a crew is given a second board in its own organisation', async () => {
  const link = await attachCrew({ crew: await requireOwnCrew(crew, owner), projectId: board.second, teamId: team, userId: owner })
  assert.equal(link.projectId, board.second)

  const [shadow] = await db.select().from(projects).where(eq(projects.id, link.shadowProjectId))
  assert.equal(shadow!.teamId, team, 'the shadow board is in the crew\'s own team')
})

test('the crew\'s own work board is refused with the same 400 message', async () => {
  await refusedWith400(attachCrew({ crew: await requireOwnCrew(crew, owner), projectId: board.work, teamId: team, userId: owner }))
})

test('a shadow board is refused with the same 400 message', async () => {
  const [link] = await db.select().from(crewBoards).where(eq(crewBoards.projectId, board.second))
  assert.ok(link, 'the link from the first test exists')
  await refusedWith400(attachCrew({ crew: await requireOwnCrew(crew, owner), projectId: link!.shadowProjectId, teamId: team, userId: owner }))
})
