// A crew made before the person keys were renamed (w1..w4, pietje, pm, nitpicker) gets the new ones: account
// address, key name and fork member row. Needs the dev database. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/crew-key-rename.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const { apiKeys, crewBoardMembers, crewBoards, crews, member, organization, projects, user } = await import('../server/db/schema')
const { renameCrewPersonKeys } = await import('../server/utils/crewKeyRename')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `ckr-${tag}-${name}`
const now = Date.now()
const at = new Date()

const slug = `ckr${tag}`
const crewTeam = id('crew-team')
const realTeam = id('real-team')
const realBoard = id('real-board')
const shadowBoard = id('shadow-board')
const crewId = id('crew')
const linkId = id('link')
const owner = id('owner')

const accounts = [
  { id: id('wren'), email: `${slug}-w1@crew.invalid`, key: 'wren', old: 'w1' },
  { id: id('usher'), email: `${slug}-pietje@crew.invalid`, key: 'usher', old: 'pietje' },
  { id: id('pia'), email: `${slug}-pm@crew.invalid`, key: 'pia', old: 'pm' },
  { id: id('fork'), email: `${slug}-f1-w2@crew.invalid`, key: 'wick', old: 'w2' },
  { id: id('nina'), email: `${slug}-nitpicker@crew.invalid`, key: 'nina', old: 'nitpicker' }
]
const strangerNotCrew = { id: id('stranger'), email: `someone-w1@crew.invalid` }

before(async () => {
  await db.insert(user).values({ id: owner, name: owner, email: `${owner}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(organization).values([
    { id: crewTeam, name: 'Crew team', slug: crewTeam, createdAt: at },
    { id: realTeam, name: 'Real team', slug: realTeam, createdAt: at }
  ])
  await db.insert(crews).values({ id: crewId, slug, name: 'Key rename crew', teamId: crewTeam, createdBy: owner, createdAt: now } as never)
  for (const account of accounts) {
    await db.insert(user).values({ id: account.id, name: account.key, email: account.email, emailVerified: false, crewId, createdAt: at, updatedAt: at })
    await db.insert(apiKeys).values({ id: id(`key-${account.key}`), userId: account.id, teamId: crewTeam, name: `crew ${account.old}`, keyHash: id(`hash-${account.key}`), keyPrefix: 'arn_', createdAt: now })
  }
  // An account with the same ending that is not a crew account is not touched.
  await db.insert(user).values({ id: strangerNotCrew.id, name: 'Stranger', email: strangerNotCrew.email, emailVerified: false, createdAt: at, updatedAt: at })
  await db.insert(projects).values([
    { id: realBoard, userId: owner, teamId: realTeam, name: 'Real', createdAt: now, updatedAt: now },
    { id: shadowBoard, userId: owner, teamId: crewTeam, name: 'Shadow', createdAt: now, updatedAt: now }
  ])
  await db.insert(crewBoards).values({ id: linkId, crewId, projectId: realBoard, shadowProjectId: shadowBoard, createdBy: owner, createdAt: now })
  await db.insert(member).values({ id: id('m'), organizationId: crewTeam, userId: accounts[3]!.id, role: 'member', createdAt: at })
  await db.insert(crewBoardMembers).values({ id: id('cbm'), linkId, userId: accounts[3]!.id, personKey: 'w2', agentType: 'internal-tools-wick', createdAt: now })
})

after(async () => {
  await db.delete(crewBoards).where(eq(crewBoards.id, linkId))
  await db.delete(projects).where(inArray(projects.id, [realBoard, shadowBoard]))
  await db.delete(user).where(inArray(user.id, [owner, strangerNotCrew.id, ...accounts.map(a => a.id)]))
  await db.delete(crews).where(eq(crews.id, crewId))
  await db.delete(organization).where(inArray(organization.id, [crewTeam, realTeam]))
  await db.$client.end()
})

test('a crew account, its key name and a fork member row move to the new person keys', async () => {
  await renameCrewPersonKeys()
  const emails = await db.select({ id: user.id, email: user.email }).from(user).where(inArray(user.id, accounts.map(a => a.id)))
  for (const account of accounts) {
    const prefix = account.id === accounts[3]!.id ? `${slug}-f1` : slug
    assert.equal(emails.find(row => row.id === account.id)?.email, `${prefix}-${account.key}@crew.invalid`, account.old)
  }
  const names = await db.select({ name: apiKeys.name }).from(apiKeys).where(inArray(apiKeys.userId, accounts.map(a => a.id)))
  assert.deepEqual(names.map(row => row.name).sort(), ['crew nina', 'crew pia', 'crew usher', 'crew wick', 'crew wren'])
  const [row] = await db.select({ key: crewBoardMembers.personKey }).from(crewBoardMembers).where(eq(crewBoardMembers.linkId, linkId))
  assert.equal(row?.key, 'wick')
})

test('an account that is not a crew account keeps its address', async () => {
  const [row] = await db.select({ email: user.email }).from(user).where(eq(user.id, strangerNotCrew.id))
  assert.equal(row?.email, strangerNotCrew.email)
})

test('running it again moves nothing', async () => {
  const again = await renameCrewPersonKeys()
  assert.deepEqual(again, { accounts: 0, keys: 0, members: 0 })
})
