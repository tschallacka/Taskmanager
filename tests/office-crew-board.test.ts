// Which boards get the Office view: a crew's shadow board and the board a crew was made on, and no other.
// Needs the dev database and the Nuxt aliases the crew modules import. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/office-crew-board.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const { crews, member, organization, projects, user } = await import('../server/db/schema')
const { allowCrews } = await import('./helpers/crewLevels')
const { attachCrew } = await import('../server/utils/crewBoards')
const { isCrewBoard } = await import('../server/utils/officeCast')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `ocb-${tag}-${name}`
const slug = `ocb-${tag}`
const now = Date.now()
const owner = id('owner')
const realTeam = id('real-team')
const crewTeam = id('crew-team')
const crewId = id('crew')
const realBoard = id('real-board')
const ownBoard = id('own-board')
const plainBoard = id('plain-board')
let shadowId = ''

before(async () => {
  const at = new Date()
  await db.insert(user).values({ id: owner, name: 'Owner', email: `${owner}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(organization).values([realTeam, crewTeam].map(t => ({ id: t, name: t, slug: t, createdAt: at })))
  await db.insert(member).values([
    { id: id('m1'), organizationId: realTeam, userId: owner, role: 'owner', createdAt: at },
    { id: id('m2'), organizationId: crewTeam, userId: owner, role: 'owner', createdAt: at }
  ])
  await db.insert(projects).values([
    { id: realBoard, userId: owner, teamId: realTeam, name: 'Real board', createdAt: now, updatedAt: now },
    { id: ownBoard, userId: owner, teamId: crewTeam, name: 'Crew board', createdAt: now, updatedAt: now },
    { id: plainBoard, userId: owner, teamId: realTeam, name: 'Plain board', createdAt: now, updatedAt: now }
  ])
  await db.insert(crews).values({ id: crewId, slug, name: 'Office crew', teamId: crewTeam, boardId: ownBoard, createdBy: owner, createdAt: now })
  // The crew's own accounts, as provisioning names them: <slug>-<key>@crew.invalid.
  const at2 = new Date()
  await db.insert(user).values(['boss', 'wren'].map(key => ({
    id: id(`acct-${key}`),
    name: key === 'boss' ? 'Boss' : 'Wren Worker',
    email: `${slug}-${key}@crew.invalid`,
    emailVerified: false,
    createdAt: at2,
    updatedAt: at2,
    crewId
  })))
  const [crew] = await db.select().from(crews).where(eq(crews.id, crewId))
  await allowCrews(owner, realTeam, [realBoard])
  const link = await attachCrew({ crew: crew!, projectId: realBoard, teamId: realTeam, userId: owner })
  shadowId = link.shadowProjectId
})

after(async () => {
  const accounts = (await db.select({ id: user.id }).from(user).where(eq(user.crewId, crewId))).map(u => u.id)
  if (accounts.length) await db.delete(user).where(inArray(user.id, accounts))
  const boards = (await db.select({ id: projects.id }).from(projects).where(inArray(projects.teamId, [realTeam, crewTeam]))).map(p => p.id)
  if (boards.length) await db.delete(projects).where(inArray(projects.id, boards))
  await db.delete(crews).where(eq(crews.id, crewId))
  await db.delete(organization).where(inArray(organization.id, [realTeam, crewTeam]))
  await db.delete(user).where(inArray(user.id, [owner]))
  await db.$client.end()
})

test('a crew\'s shadow board has the Office view', async () => {
  assert.equal(await isCrewBoard(shadowId), true)
})

test('the board a crew was made on has it too', async () => {
  assert.equal(await isCrewBoard(ownBoard), true)
})

test('the real board a crew works on does not: its office answers 404, so no tab', async () => {
  assert.equal(await isCrewBoard(realBoard), false)
})

test('an ordinary board has no Office view', async () => {
  assert.equal(await isCrewBoard(plainBoard), false)
})
