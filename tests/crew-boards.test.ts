// Giving a board a crew: who may attach which crew, the shadow board that is made in the crew's
// own team, and what detaching leaves behind. Needs the dev database and the Nuxt aliases:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/crew-boards.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { asc, eq, inArray } from 'drizzle-orm'

// Nitro provides createError as a global; the crew code expects it.
Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { crewBoards, crews, customers, member, organization, projectColumns, projects, user } = schema
const { attachCrew, crewLinksOfTeam, crewsToAttach, detachCrew, findCrewLink, requireOwnCrew, shadowBoardName } = await import('../server/utils/crewBoards')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `tcb-${tag}-${name}`
const now = Date.now()

const owner = id('owner')
const other = id('other')
const realTeam = id('real-team')
const crewTeam = id('crew-team')
const customer = id('customer')
const crew = { mine: id('crew-mine'), theirs: id('crew-theirs'), off: id('crew-off') }
const board = { real: id('board-real'), archived: id('board-archived'), crewOwn: id('board-crew-own') }

const rejects = (promise: Promise<unknown>, status: number) =>
  assert.rejects(promise, (e: { statusCode?: number }) => e.statusCode === status)

before(async () => {
  const at = new Date()
  await db.insert(user).values([owner, other].map(u => ({ id: u, name: u, email: `${u}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })))
  await db.insert(organization).values([
    { id: realTeam, name: 'Real team', slug: realTeam, createdAt: at },
    { id: crewTeam, name: 'Crew team', slug: crewTeam, createdAt: at }
  ])
  await db.insert(member).values([
    { id: id('m1'), organizationId: realTeam, userId: owner, role: 'owner', createdAt: at },
    { id: id('m2'), organizationId: realTeam, userId: other, role: 'admin', createdAt: at }
  ])
  await db.insert(customers).values({ id: customer, organizationId: crewTeam, name: 'Crew product', createdAt: now, updatedAt: now })
  const crewRow = (cid: string, slug: string, by: string, disabledAt: number | null = null) =>
    ({ id: cid, slug: `${slug}-${tag}`, name: `Crew ${slug}`, teamId: crewTeam, customerId: customer, createdBy: by, createdAt: now, disabledAt })
  await db.insert(crews).values([
    crewRow(crew.mine, 'mine', owner),
    crewRow(crew.theirs, 'theirs', other),
    crewRow(crew.off, 'off', owner, now)
  ])
  const boardRow = (bid: string, teamId: string, extra: object = {}) =>
    ({ id: bid, userId: owner, teamId, name: bid.slice(-12), createdAt: now, updatedAt: now, ...extra })
  await db.insert(projects).values([
    boardRow(board.real, realTeam),
    boardRow(board.archived, realTeam, { archivedAt: now }),
    boardRow(board.crewOwn, crewTeam)
  ])
})

after(async () => {
  const shadows = await db.select({ id: projects.id }).from(projects).where(eq(projects.teamId, crewTeam))
  await db.delete(projects).where(inArray(projects.id, [...shadows.map(s => s.id), board.real, board.archived]))
  await db.delete(organization).where(inArray(organization.id, [realTeam, crewTeam]))
  await db.delete(user).where(inArray(user.id, [owner, other]))
  await db.$client.end()
})

test('a person attaches only a live crew they made themselves', async () => {
  assert.equal((await requireOwnCrew(crew.mine, owner)).id, crew.mine)
  await rejects(requireOwnCrew(crew.theirs, owner), 404)
  await rejects(requireOwnCrew(crew.off, owner), 400)
  await rejects(requireOwnCrew('no-such-crew', owner), 404)
  await rejects(requireOwnCrew(undefined, owner), 400)
  assert.deepEqual((await crewsToAttach(owner)).map(c => c.id), [crew.mine])
})

test('attaching makes a shadow board in the crew team, with the crew board columns and customer', async () => {
  const link = await attachCrew({ crew: await requireOwnCrew(crew.mine, owner), projectId: board.real, teamId: realTeam, userId: owner })
  assert.equal(link.projectId, board.real)

  const [shadow] = await db.select().from(projects).where(eq(projects.id, link.shadowProjectId))
  assert.equal(shadow!.teamId, crewTeam)
  assert.equal(shadow!.customerId, customer)
  assert.equal(shadow!.name, shadowBoardName(board.real.slice(-12)))
  const columns = await db.select({ name: projectColumns.name }).from(projectColumns)
    .where(eq(projectColumns.projectId, shadow!.id)).orderBy(asc(projectColumns.position))
  assert.deepEqual(columns.map(c => c.name), ['Backlog', 'To do', 'In progress', 'Verify', 'Ready for live', 'Done', 'Bugs'])
})

test('the same crew cannot be attached to a board twice', async () => {
  await rejects(attachCrew({ crew: await requireOwnCrew(crew.mine, owner), projectId: board.real, teamId: realTeam, userId: owner }), 409)
})

test('a board of another team, an archived board and a crew own board are refused', async () => {
  const mine = await requireOwnCrew(crew.mine, owner)
  await rejects(attachCrew({ crew: mine, projectId: board.crewOwn, teamId: realTeam, userId: owner }), 404)
  await rejects(attachCrew({ crew: mine, projectId: board.archived, teamId: realTeam, userId: owner }), 400)
  await rejects(attachCrew({ crew: mine, projectId: board.crewOwn, teamId: crewTeam, userId: owner }), 400)
  await rejects(attachCrew({ crew: mine, projectId: 'no-such-board', teamId: realTeam, userId: owner }), 404)
  await rejects(attachCrew({ crew: mine, projectId: undefined, teamId: realTeam, userId: owner }), 400)
})

test('the links are listed under the team of the real board, and not under the crew team', async () => {
  const links = await crewLinksOfTeam(realTeam)
  assert.equal(links.length, 1)
  assert.equal(links[0]!.crewId, crew.mine)
  assert.equal(links[0]!.projectId, board.real)
  assert.equal(links[0]!.crewDisabled, false)
  assert.deepEqual(await crewLinksOfTeam(crewTeam), [])
})

test('detaching drops the link and archives the shadow board instead of deleting it', async () => {
  const [row] = await db.select().from(crewBoards).where(eq(crewBoards.crewId, crew.mine))
  assert.equal(await findCrewLink(crewTeam, row!.id), undefined)
  const link = await findCrewLink(realTeam, row!.id)
  assert.ok(link)

  await detachCrew(link!)
  assert.deepEqual(await crewLinksOfTeam(realTeam), [])
  const [shadow] = await db.select().from(projects).where(eq(projects.id, row!.shadowProjectId))
  assert.ok(shadow!.archivedAt)
  // The crew can be given the board again after it was taken off.
  const again = await attachCrew({ crew: await requireOwnCrew(crew.mine, owner), projectId: board.real, teamId: realTeam, userId: owner })
  assert.notEqual(again.shadowProjectId, row!.shadowProjectId)
})
