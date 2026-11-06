// Who sits in the office view: a shadow board seats the members forked for it, a crew's own board seats
// the crew's accounts, the customer logins never sit anywhere, and other assignees get a guest desk.
// Needs the dev database and the Nuxt aliases the crew modules import. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/office-cast.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { and, eq, inArray } from 'drizzle-orm'

Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const { crewBoardMembers, crews, member, organization, projects, user } = await import('../server/db/schema')
const { attachCrew } = await import('../server/utils/crewBoards')
const { forkCrew } = await import('../server/utils/crewForks')
const { officeCastOf } = await import('../server/utils/officeCast')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `toc-${tag}-${name}`
const slug = `toc-${tag}`
const now = Date.now()
const owner = id('owner')
const stranger = id('stranger')
const realTeam = id('real-team')
const crewTeam = id('crew-team')
const crewId = id('crew')
const realBoard = id('real-board')
const ownBoard = id('own-board')
let shadowId = ''

before(async () => {
  const at = new Date()
  await db.insert(user).values([
    { id: owner, name: 'Owner', email: `${owner}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at },
    { id: stranger, name: 'Sam Stranger', email: `${stranger}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at }
  ])
  await db.insert(organization).values([realTeam, crewTeam].map(t => ({ id: t, name: t, slug: t, createdAt: at })))
  await db.insert(member).values([
    { id: id('m1'), organizationId: realTeam, userId: owner, role: 'owner', createdAt: at },
    { id: id('m2'), organizationId: crewTeam, userId: owner, role: 'owner', createdAt: at }
  ])
  await db.insert(projects).values([
    { id: realBoard, userId: owner, teamId: realTeam, name: 'Real board', createdAt: now, updatedAt: now },
    { id: ownBoard, userId: owner, teamId: crewTeam, name: 'Crew board', createdAt: now, updatedAt: now }
  ])
  await db.insert(crews).values({ id: crewId, slug, name: 'Office crew', teamId: crewTeam, boardId: ownBoard, createdBy: owner, createdAt: now })
  // The crew's own accounts, as provisioning names them: <slug>-<key>@crew.invalid.
  await db.insert(user).values(['boss', 'wren', 'customer'].map(key => ({
    id: id(`acct-${key}`),
    name: key === 'boss' ? 'Boss' : key === 'wren' ? 'Wren Worker' : 'Scrappy Customer',
    email: `${slug}-${key}@crew.invalid`,
    emailVerified: false,
    createdAt: at,
    updatedAt: at,
    crewId
  })))
  const [crew] = await db.select().from(crews).where(eq(crews.id, crewId))
  const link = await attachCrew({ crew: crew!, projectId: realBoard, teamId: realTeam, userId: owner })
  shadowId = link.shadowProjectId
  await forkCrew({ crew: crew!, link, boardName: 'Real board', rotate: false })
})

after(async () => {
  const accounts = (await db.select({ id: user.id }).from(user).where(eq(user.crewId, crewId))).map(u => u.id)
  if (accounts.length) await db.delete(user).where(inArray(user.id, accounts))
  const boards = (await db.select({ id: projects.id }).from(projects).where(inArray(projects.teamId, [realTeam, crewTeam]))).map(p => p.id)
  if (boards.length) await db.delete(projects).where(inArray(projects.id, boards))
  await db.delete(crews).where(eq(crews.id, crewId))
  await db.delete(organization).where(inArray(organization.id, [realTeam, crewTeam]))
  await db.delete(user).where(inArray(user.id, [owner, stranger]))
  await db.$client.end()
})

test('a shadow board seats the members forked for it, the crew\'s Boss, and a guest; never the customer', async () => {
  const { crewName, cast } = await officeCastOf(shadowId, [stranger])
  assert.equal(crewName, 'Office crew')
  assert.deepEqual(cast.map(p => p.key), ['pia', `u-${stranger}`, 'wade', 'wick', 'wren', 'wynn', 'usher', 'nina', 'quincy', 'boss'])
  assert.deepEqual(cast.map(p => p.role), ['pm', 'worker', 'worker', 'worker', 'worker', 'worker', 'ux', 'cq', 'qa', 'boss'])
  // Wren is the fork for this board, not the crew's own Wren account.
  const [fork] = await db.select({ userId: crewBoardMembers.userId }).from(crewBoardMembers)
    .innerJoin(user, eq(user.id, crewBoardMembers.userId))
    .where(and(eq(crewBoardMembers.personKey, 'wren'), eq(user.crewId, crewId)))
  assert.equal(cast.find(p => p.key === 'wren')!.userId, fork!.userId)
  assert.equal(cast.find(p => p.key === `u-${stranger}`)!.name, 'Sam Stranger')
  assert.ok(cast.every(p => !('email' in p)))
})

test('the crew\'s own board seats the crew\'s own accounts and none of its forks', async () => {
  const { cast } = await officeCastOf(ownBoard, [])
  assert.deepEqual(cast.map(p => [p.key, p.userId]), [['wren', id('acct-wren')], ['boss', id('acct-boss')]])
})

test('a board without a crew seats only its assignees', async () => {
  const { crewName, cast } = await officeCastOf(realBoard, [stranger, stranger])
  assert.equal(crewName, null)
  assert.deepEqual(cast.map(p => p.key), [`u-${stranger}`])
})
