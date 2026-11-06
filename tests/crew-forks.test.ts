// A crew's members forked per board: accounts named for the board, keys limited to its shadow board,
// left alone by the crew's own rotate, cut off with the crew, and removed with the link. Needs the dev
// database and the Nuxt aliases the tool modules import. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/crew-forks.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { and, eq, inArray } from 'drizzle-orm'

// Nitro provides createError as a global; the crew code expects it.
Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { apiKeys, crewBoardMembers, crews, member, organization, projects, user } = schema
const { attachCrew, detachCrew, findCrewLink } = await import('../server/utils/crewBoards')
const { CREW_PEOPLE } = await import('../server/utils/crewProvisioning')
const { FORK_PEOPLE, extraKeysOf, forkAgentType, forkCrew, forksOfLink, removeForks } = await import('../server/utils/crewForks')
const { createOrRotateCrew, crewView, disableCrew } = await import('../server/utils/crewProvisioning')
const { readGrantedBoardIds } = await import('../server/utils/crewBoardAccess')
const { boardFilter } = await import('../server/utils/mcpAccess')
const { hashApiKey } = await import('../server/utils/api-keys')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `tcf-${tag}-${name}`
const now = Date.now()

const boss = id('boss')
const realTeam = id('real-team')
const crewTeam = id('crew-team')
const crewId = id('crew')
const boardA = id('board-a')
const boardB = id('board-b')
const boardC = id('board-c')

const rejects = (promise: Promise<unknown>, status: number) =>
  assert.rejects(promise, (e: { statusCode?: number }) => e.statusCode === status)

let crew: typeof crews.$inferSelect
let linkA: Awaited<ReturnType<typeof attachCrew>>
let linkB: Awaited<ReturnType<typeof attachCrew>>
let linkC: Awaited<ReturnType<typeof attachCrew>>

const forkIds = async (linkId: string) =>
  (await db.select({ userId: crewBoardMembers.userId }).from(crewBoardMembers).where(eq(crewBoardMembers.linkId, linkId))).map(r => r.userId)

before(async () => {
  const at = new Date()
  await db.insert(user).values({ id: boss, name: boss, email: `${boss}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(organization).values([realTeam, crewTeam].map(t => ({ id: t, name: t, slug: t, createdAt: at })))
  await db.insert(member).values([
    { id: id('m1'), organizationId: realTeam, userId: boss, role: 'owner', createdAt: at },
    { id: id('m2'), organizationId: crewTeam, userId: boss, role: 'owner', createdAt: at }
  ])
  await db.insert(crews).values({ id: crewId, slug: `tcf-${tag}`, name: 'Fork crew', teamId: crewTeam, createdBy: boss, createdAt: now })
  await db.insert(projects).values([
    { id: boardA, userId: boss, teamId: realTeam, name: 'Internal Tools', createdAt: now, updatedAt: now },
    { id: boardB, userId: boss, teamId: realTeam, name: 'Acme Website', createdAt: now, updatedAt: now },
    { id: boardC, userId: boss, teamId: realTeam, name: 'Office', createdAt: now, updatedAt: now }
  ])
  crew = (await db.select().from(crews).where(eq(crews.id, crewId)))[0]!
  linkA = await attachCrew({ crew, projectId: boardA, teamId: realTeam, userId: boss })
  linkB = await attachCrew({ crew, projectId: boardB, teamId: realTeam, userId: boss })
  linkC = await attachCrew({ crew, projectId: boardC, teamId: realTeam, userId: boss })
})

after(async () => {
  const forks = (await db.select({ id: user.id }).from(user).where(eq(user.crewId, crewId))).map(u => u.id)
  if (forks.length) await db.delete(user).where(inArray(user.id, forks))
  const shadows = await db.select({ id: projects.id }).from(projects).where(eq(projects.teamId, crewTeam))
  await db.delete(projects).where(inArray(projects.id, [...shadows.map(s => s.id), boardA, boardB, boardC]))
  await db.delete(organization).where(inArray(organization.id, [realTeam, crewTeam]))
  await db.delete(user).where(eq(user.id, boss))
  await db.$client.end()
})

test('an agent type is the board, then the person first name', () => {
  assert.equal(forkAgentType('Internal Tools', 'Wren Worker'), 'internal-tools-wren')
  assert.equal(forkAgentType('Fundesign Magento store!', 'Pia Planner'), 'fundesign-magento-store-pia')
  assert.equal(forkAgentType('???', 'Nina Nitpick'), 'board-nina')
})

test('only the working members are forked: not Boss, not the customer logins', () => {
  assert.deepEqual(FORK_PEOPLE.map(p => p.key), ['pia', 'wren', 'wick', 'wynn', 'wade', 'usher', 'nina', 'quincy'])
})

let forkedA: Awaited<ReturnType<typeof forkCrew>>

test('forking makes one account per member, named for the board, in the crew and its team', async () => {
  forkedA = await forkCrew({ crew, link: linkA, boardName: 'Internal Tools', rotate: false })
  assert.equal(forkedA.length, FORK_PEOPLE.length)
  assert.ok(forkedA.some(m => m.agentType === 'internal-tools-wren'))
  for (const forked of forkedA) {
    assert.ok(forked.password.length >= 20 && forked.apiKey.startsWith('arn_'))
    assert.match(forked.email, /@crew\.invalid$/)
  }
  const accounts = await db.select().from(user).where(inArray(user.id, await forkIds(linkA.id)))
  assert.equal(accounts.length, FORK_PEOPLE.length)
  assert.ok(accounts.every(a => a.crewId === crewId))
  assert.ok(accounts.some(a => a.name === 'Wren Worker (Internal Tools)'))
  const seats = await db.select().from(member).where(and(eq(member.organizationId, crewTeam), inArray(member.userId, accounts.map(a => a.id))))
  assert.equal(seats.length, FORK_PEOPLE.length)
})

test('every fork key is limited to exactly its own shadow board, in the crew team', async () => {
  for (const forked of forkedA) {
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hashApiKey(forked.apiKey)))
    assert.equal(key!.projectId, linkA.shadowProjectId)
    assert.equal(key!.customerId, null)
    assert.equal(key!.teamId, crewTeam)
  }
})

test('a fork reads its own shadow board and the one real board behind it, nothing else', async () => {
  // This run's own fork, found through its board link: other crews in the dev database have a Wren of the same name.
  const [wren] = await db.select({ id: crewBoardMembers.userId }).from(crewBoardMembers)
    .where(and(eq(crewBoardMembers.linkId, linkA.id), eq(crewBoardMembers.personKey, 'wren')))
  const context = { keyId: 'k', keyName: 'k', userId: wren!.id, teamId: crewTeam, customerId: null, projectId: linkA.shadowProjectId, scopes: ['boards:read', 'boards:write'] as ('boards:read' | 'boards:write')[], reach: { allBoards: false, workspaceTeamIds: [], boardIds: [linkA.shadowProjectId] }, memberTeamIds: [crewTeam] }
  assert.deepEqual(await readGrantedBoardIds(context), [boardA])
  const reach = async (grant: string[]) =>
    (await db.select({ id: projects.id }).from(projects).where(await boardFilter({ ...context, readGrantedBoardIds: grant }))).map(r => r.id).sort()
  assert.deepEqual(await reach([]), [linkA.shadowProjectId])
  assert.deepEqual(await reach([boardA]), [boardA, linkA.shadowProjectId].sort())
  // Not the other board of the crew, neither its shadow nor the real one.
  assert.ok(!(await reach([boardA])).some(b => b === linkB.shadowProjectId || b === boardB))
})

test('forking again is refused until it is a rotate, and a rotate gives new keys for the same accounts', async () => {
  await rejects(forkCrew({ crew, link: linkA, boardName: 'Internal Tools', rotate: false }), 409)
  const before = await forkIds(linkA.id)
  const rotated = await forkCrew({ crew, link: linkA, boardName: 'Internal Tools', rotate: true })
  assert.equal(rotated.length, FORK_PEOPLE.length)
  assert.deepEqual((await forkIds(linkA.id)).sort(), before.sort())
  for (const old of forkedA) {
    assert.deepEqual(await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hashApiKey(old.apiKey))), [], 'the old key is gone')
    const next = rotated.find(m => m.key === old.key)!
    assert.notEqual(next.apiKey, old.apiKey)
    assert.notEqual(next.password, old.password)
    assert.equal(next.email, old.email)
  }
  forkedA = rotated
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hashApiKey(forkedA[0]!.apiKey)))
  assert.equal(key!.projectId, linkA.shadowProjectId, 'still limited after the rotate')
})

test('a board forked has its forks listed, one that is not has none', async () => {
  assert.deepEqual((await forksOfLink(linkA.id)).map(f => f.key), ['pia', 'wren', 'wick', 'wynn', 'wade', 'usher', 'nina', 'quincy'])
  assert.deepEqual(await forksOfLink(linkB.id), [])
})

test('the status view of the crew does not list its forks', async () => {
  const view = await crewView(crew)
  assert.equal(view.people.length, 0)
})

test('the crew own rotate leaves the forks and their limited keys untouched', async () => {
  const keysOf = async () => (await db.select({ hash: apiKeys.keyHash, projectId: apiKeys.projectId }).from(apiKeys)
    .where(inArray(apiKeys.userId, await forkIds(linkA.id)))).sort((a, b) => a.hash.localeCompare(b.hash))
  const before = await keysOf()
  assert.equal(before.length, FORK_PEOPLE.length)

  const caller = { userId: boss, keyId: null, keyName: 'test' }
  const rotated = await createOrRotateCrew({ slug: crew.slug, name: crew.name, product: { name: 'Fork product' }, rotate: true }, caller)
  assert.equal(rotated.status, 200)

  // The same keys, each still limited to the one shadow board: a rotate that re-keyed them would have
  // minted team-wide keys in their place.
  assert.deepEqual(await keysOf(), before)
  assert.ok(before.every(k => k.projectId === linkA.shadowProjectId))
  // And the crew's own people are now there beside them, without the forks among them.
  const view = await crewView(crew)
  assert.equal(view.people.length, CREW_PEOPLE.length)
})

test('disabling the crew cuts every fork off: their keys are gone', async () => {
  await disableCrew(crew)
  const keys = await db.select().from(apiKeys).where(inArray(apiKeys.userId, await forkIds(linkA.id)))
  assert.equal(keys.length, 0)
  await db.update(crews).set({ disabledAt: null }).where(eq(crews.id, crewId))
})

test('extra workers are not forked with the standard members', async () => {
  await forkCrew({ crew, link: linkC, boardName: 'Office', rotate: false })
  assert.deepEqual((await forksOfLink(linkC.id)).map(f => f.key), FORK_PEOPLE.map(p => p.key))
})

let addedC: Awaited<ReturnType<typeof forkCrew>>
const standardHashesC: string[] = []

test('add on a forked board makes exactly the asked-for extras, with keys limited to the shadow board', async () => {
  standardHashesC.push(...(await db.select({ hash: apiKeys.keyHash }).from(apiKeys)
    .where(inArray(apiKeys.userId, await forkIds(linkC.id)))).map(row => row.hash))
  addedC = await forkCrew({ crew, link: linkC, boardName: 'Office', rotate: false, add: ['wes', 'wilma'] })
  assert.deepEqual(addedC.map(m => m.key), ['wes', 'wilma'])
  for (const forked of addedC) {
    assert.equal(forked.agentType, forkAgentType('Office', forked.name))
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hashApiKey(forked.apiKey)))
    assert.equal(key!.projectId, linkC.shadowProjectId)
    assert.equal(key!.teamId, crewTeam)
  }
  assert.equal((await forkIds(linkC.id)).length, FORK_PEOPLE.length + 2)
  assert.deepEqual((await forksOfLink(linkC.id)).map(f => f.key), [...FORK_PEOPLE.map(p => p.key), 'wes', 'wilma'])
})

test('the forks already there keep their keys: none is minted again, and each key minted before still exists', async () => {
  const hashesNow = (await db.select({ hash: apiKeys.keyHash }).from(apiKeys)
    .where(inArray(apiKeys.userId, await forkIds(linkC.id)))).map(row => row.hash)
  assert.equal(standardHashesC.length, FORK_PEOPLE.length)
  for (const hash of standardHashesC) assert.ok(hashesNow.includes(hash), 'a key minted before the add still exists')
})

test('a second identical add makes nothing new, and unknown or malformed extras are refused with 400', async () => {
  assert.deepEqual(await forkCrew({ crew, link: linkC, boardName: 'Office', rotate: false, add: ['wes', 'wilma'] }), [])
  assert.equal((await forkIds(linkC.id)).length, FORK_PEOPLE.length + 2)
  assert.throws(() => extraKeysOf(['zed']), (e: { statusCode?: number }) => e.statusCode === 400)
  assert.throws(() => extraKeysOf('wes'), (e: { statusCode?: number }) => e.statusCode === 400)
  assert.deepEqual(extraKeysOf(undefined), [])
  assert.deepEqual(extraKeysOf(['walt', 'walt']), ['walt'])
})

test('a rotate gives every fork and the extras new keys, and creates the extra that is asked for', async () => {
  const rotated = await forkCrew({ crew, link: linkC, boardName: 'Office', rotate: true, add: ['walt'] })
  assert.deepEqual(rotated.map(m => m.key), [...FORK_PEOPLE.map(p => p.key), 'wes', 'wilma', 'walt'])
  for (const old of addedC) assert.notEqual(rotated.find(m => m.key === old.key)!.apiKey, old.apiKey)
  assert.equal((await forkIds(linkC.id)).length, FORK_PEOPLE.length + 3)
})

test('taking the crew off the board removes its forks, and leaves the forks of another board', async () => {
  await forkCrew({ crew, link: linkB, boardName: 'Acme Website', rotate: false })
  const gone = await forkIds(linkA.id)
  await detachCrew((await findCrewLink(realTeam, linkA.id))!)
  assert.equal((await db.select().from(user).where(inArray(user.id, gone))).length, 0)
  assert.equal((await forkIds(linkB.id)).length, FORK_PEOPLE.length)
  await removeForks(linkB.id)
  assert.equal((await forkIds(linkB.id)).length, 0)
})
