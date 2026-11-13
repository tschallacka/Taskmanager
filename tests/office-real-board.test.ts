// The crews of a real (main) board, and the office each one seats (server/utils/officeCast.ts): a main board with one
// crew, with two, with none, with a disabled crew only, and a crew's shadow board as before. The customer rule is
// the route's (GET /api/projects/:id/office answers 404 to a customer contact); it is not repeated here. Needs a
// scratch database (arnotes_test_<key>); it writes rows with a random tag and removes them. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_<key> node --import tsx --test --test-force-exit tests/office-real-board.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'

const { db } = await import('../server/db')
const { crewBoards, crews, organization, projects, user } = await import('../server/db/schema')
const { crewsOfRealBoard, officeCastOf } = await import('../server/utils/officeCast')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `orb-${tag}-${name}`
const now = Date.now()
const at = new Date()

const owner = id('owner')
const team = id('team')
const crewTeam = id('crew-team')

const main = { one: id('main-one'), two: id('main-two'), none: id('main-none'), disabledOnly: id('main-disabled') }
const shadow = { a: id('shadow-a'), b: id('shadow-b'), c: id('shadow-c'), d: id('shadow-d') }
const crewIds = { a: id('crew-a'), b: id('crew-b'), c: id('crew-c'), d: id('crew-d') }
const names = { a: 'Alpha crew', b: 'Beta crew', c: 'Gamma crew', d: 'Delta crew (off)' }

before(async () => {
  await db.insert(user).values({ id: owner, name: owner, email: `${owner}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(organization).values([
    { id: team, name: 'Office team (test)', slug: team, createdAt: at },
    { id: crewTeam, name: 'Office crew team (test)', slug: crewTeam, createdAt: at }
  ])
  await db.insert(projects).values([
    { id: main.one, userId: owner, teamId: team, name: 'Main one', createdAt: now, updatedAt: now },
    { id: main.two, userId: owner, teamId: team, name: 'Main two', createdAt: now, updatedAt: now },
    { id: main.none, userId: owner, teamId: team, name: 'Main none', createdAt: now, updatedAt: now },
    { id: main.disabledOnly, userId: owner, teamId: team, name: 'Main disabled', createdAt: now, updatedAt: now },
    ...Object.values(shadow).map(s => ({ id: s, userId: owner, teamId: crewTeam, name: `Shadow ${s}`, createdAt: now, updatedAt: now }))
  ])
  await db.insert(crews).values([
    { id: crewIds.a, slug: `orb-${tag}-a`, name: names.a, teamId: crewTeam, createdBy: owner, createdAt: now },
    { id: crewIds.b, slug: `orb-${tag}-b`, name: names.b, teamId: crewTeam, createdBy: owner, createdAt: now },
    { id: crewIds.c, slug: `orb-${tag}-c`, name: names.c, teamId: crewTeam, createdBy: owner, createdAt: now },
    { id: crewIds.d, slug: `orb-${tag}-d`, name: names.d, teamId: crewTeam, createdBy: owner, createdAt: now, disabledAt: now }
  ])
  await db.insert(crewBoards).values([
    // main one has two live crews (A and B); A's shadow is shadow.a
    { id: id('link-a'), crewId: crewIds.a, projectId: main.one, shadowProjectId: shadow.a, createdAt: now },
    { id: id('link-b'), crewId: crewIds.b, projectId: main.one, shadowProjectId: shadow.b, createdAt: now },
    // main two has one live crew (C)
    { id: id('link-c'), crewId: crewIds.c, projectId: main.two, shadowProjectId: shadow.c, createdAt: now },
    // main disabled has only a disabled crew (D)
    { id: id('link-d'), crewId: crewIds.d, projectId: main.disabledOnly, shadowProjectId: shadow.d, createdAt: now }
  ])
})

after(async () => {
  await db.delete(crewBoards).where(inArray(crewBoards.crewId, Object.values(crewIds)))
  await db.delete(crews).where(inArray(crews.id, Object.values(crewIds)))
  await db.delete(projects).where(inArray(projects.id, [...Object.values(main), ...Object.values(shadow)]))
  await db.delete(organization).where(inArray(organization.id, [team, crewTeam]))
  await db.delete(user).where(eq(user.id, owner))
})

test('a main board with two live crews lists both, by name', async () => {
  const listed = await crewsOfRealBoard(main.one)
  assert.deepEqual(listed, [{ id: crewIds.a, name: names.a }, { id: crewIds.b, name: names.b }])
})

test('a main board with one live crew lists that crew', async () => {
  assert.deepEqual(await crewsOfRealBoard(main.two), [{ id: crewIds.c, name: names.c }])
})

test('a main board with no crew, and a main board whose only crew is disabled, list nothing', async () => {
  assert.deepEqual(await crewsOfRealBoard(main.none), [])
  assert.deepEqual(await crewsOfRealBoard(main.disabledOnly), [])
})

test('a shadow board lists no crews as a real board; its office is still its crew\'s', async () => {
  assert.deepEqual(await crewsOfRealBoard(shadow.a), [])
  const office = await officeCastOf(shadow.a, [], null)
  assert.equal(office.crewName, names.a)
})

test('a main board seats the crew it is asked for, and no crew when none is asked for', async () => {
  assert.equal((await officeCastOf(main.one, [], crewIds.b)).crewName, names.b)
  assert.equal((await officeCastOf(main.one, [], crewIds.a)).crewName, names.a)
  // With no choice the lookup has no crew: the route picks the first one, as the list above sorts it.
  assert.equal((await officeCastOf(main.one, [], null)).crewName, null)
})

test('a crew not linked to the main board does not sit in its office', async () => {
  assert.equal((await officeCastOf(main.two, [], crewIds.a)).crewName, null)
})

test('a main board with no crew has no office', async () => {
  assert.equal((await officeCastOf(main.none, [], null)).crewName, null)
})
