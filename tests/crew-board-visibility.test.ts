// Which crew boards a person may see on a real board's team (Q92, Q93): the owner sees every one,
// an admin only the boards they manage, an ordinary member only the crews they set up, and nobody
// else. Each role is tested on its own, and every role is refused a write. Needs the dev database and
// the Nuxt aliases the tool modules import. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/crew-board-visibility.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { asc, eq, inArray } from 'drizzle-orm'

// Nitro provides createError as a global; the helpers under test expect it.
Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { crews, customerMembers, customers, member, organization, projectColumns, projectGuests, projectMembers, projectTasks, projects, user } = schema
const { attachCrew } = await import('../server/utils/crewBoards')
const { crewBoardsOfRealBoard, isStaffOfShadowedBoard, readGrantedBoardIds, shadowBoardForStaff, shadowBoardIdsOfTeam, shadowBoardIdsSeenBy } = await import('../server/utils/crewBoardAccess')
const { listPins, pinBoard, unpinBoard } = await import('../server/utils/boardPins')
const { requireProject } = await import('../server/utils/projects')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `tcv-${tag}-${name}`
const now = Date.now()

const owner = id('owner')
const adminOfA = id('admin-of-a')
const adminOfB = id('admin-of-b')
const adminOfNone = id('admin-of-none')
const memberWithCrew = id('member-with-crew')
const memberPlain = id('member-plain')
const guest = id('guest')
const contact = id('contact')
const stranger = id('stranger')
const realTeam = id('real-team')
const crewTeam = id('crew-team')
const customer = id('customer')
const boardA = id('board-a')
const boardB = id('board-b')
const crewOfOwner = id('crew-owner')
const crewOfMember = id('crew-member')
const people = [owner, adminOfA, adminOfB, adminOfNone, memberWithCrew, memberPlain, guest, contact, stranger]

let shadowA = ''
let shadowB = ''
let shadowOfMember = ''

const eventOf = (userId: string, activeTeamId: string | null, method = 'GET') =>
  ({ method, context: { session: { user: { id: userId }, session: { activeOrganizationId: activeTeamId } } } }) as unknown as Parameters<typeof requireProject>[0]

const sorted = (ids: string[]) => [...ids].sort()

before(async () => {
  const at = new Date()
  await db.insert(user).values(people.map(u => ({ id: u, name: u, email: `${u}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })))
  await db.insert(organization).values([realTeam, crewTeam].map(t => ({ id: t, name: t, slug: t, createdAt: at })))
  await db.insert(member).values([
    { id: id('m-owner'), organizationId: realTeam, userId: owner, role: 'owner', createdAt: at },
    { id: id('m-admin-a'), organizationId: realTeam, userId: adminOfA, role: 'admin', createdAt: at },
    { id: id('m-admin-b'), organizationId: realTeam, userId: adminOfB, role: 'admin', createdAt: at },
    { id: id('m-admin-none'), organizationId: realTeam, userId: adminOfNone, role: 'admin', createdAt: at },
    { id: id('m-member-crew'), organizationId: realTeam, userId: memberWithCrew, role: 'member', createdAt: at },
    { id: id('m-member-plain'), organizationId: realTeam, userId: memberPlain, role: 'member', createdAt: at },
    { id: id('m-crew-owner'), organizationId: crewTeam, userId: owner, role: 'owner', createdAt: at }
  ])
  await db.insert(customers).values({ id: customer, organizationId: realTeam, name: customer, createdAt: now, updatedAt: now })
  await db.insert(customerMembers).values({ id: id('cm'), customerId: customer, userId: contact, createdAt: now })
  await db.insert(projects).values([
    { id: boardA, userId: owner, teamId: realTeam, name: 'Board A', createdAt: now, updatedAt: now },
    { id: boardB, userId: owner, teamId: realTeam, name: 'Board B', createdAt: now, updatedAt: now }
  ])
  await db.insert(projectGuests).values({ id: id('guest-a'), projectId: boardA, userId: guest, role: 'editor', createdAt: now })
  await db.insert(projectMembers).values([
    { id: id('pm-a'), projectId: boardA, userId: adminOfA, role: 'manager', createdAt: now },
    { id: id('pm-b'), projectId: boardB, userId: adminOfB, role: 'manager', createdAt: now }
  ])
  await db.insert(crews).values([
    { id: crewOfOwner, slug: `${crewOfOwner}`, name: 'Owner crew', teamId: crewTeam, createdBy: owner, createdAt: now },
    { id: crewOfMember, slug: `${crewOfMember}`, name: 'Member crew', teamId: crewTeam, createdBy: memberWithCrew, createdAt: now }
  ])
  const owned = (await db.select().from(crews).where(eq(crews.id, crewOfOwner)))[0]!
  const mine = (await db.select().from(crews).where(eq(crews.id, crewOfMember)))[0]!
  shadowA = (await attachCrew({ crew: owned, projectId: boardA, teamId: realTeam, userId: owner })).shadowProjectId
  shadowB = (await attachCrew({ crew: owned, projectId: boardB, teamId: realTeam, userId: owner })).shadowProjectId
  shadowOfMember = (await attachCrew({ crew: mine, projectId: boardA, teamId: realTeam, userId: owner })).shadowProjectId
})

after(async () => {
  const shadows = await db.select({ id: projects.id }).from(projects).where(eq(projects.teamId, crewTeam))
  await db.delete(projects).where(inArray(projects.id, [...shadows.map(s => s.id), boardA, boardB]))
  await db.delete(crews).where(inArray(crews.id, [crewOfOwner, crewOfMember]))
  await db.delete(customers).where(eq(customers.id, customer))
  await db.delete(organization).where(inArray(organization.id, [realTeam, crewTeam]))
  await db.delete(user).where(inArray(user.id, people))
  await db.$client.end()
})

test('the owner of the team sees every crew board of the team', async () => {
  assert.deepEqual(sorted(await shadowBoardIdsOfTeam(realTeam, owner)), sorted([shadowA, shadowB, shadowOfMember]))
  assert.equal((await shadowBoardForStaff(owner, realTeam, shadowB))?.id, shadowB)
  assert.equal(await isStaffOfShadowedBoard(owner, shadowOfMember), true)
})

test('an admin of board A sees the crew boards of board A, and not those of board B', async () => {
  assert.deepEqual(sorted(await shadowBoardIdsOfTeam(realTeam, adminOfA)), sorted([shadowA, shadowOfMember]))
  assert.equal(await shadowBoardForStaff(adminOfA, realTeam, shadowB), undefined)
  assert.equal(await isStaffOfShadowedBoard(adminOfA, shadowB), false)
})

test('an admin of another board, board B, sees only the crew board of board B', async () => {
  assert.deepEqual(await shadowBoardIdsOfTeam(realTeam, adminOfB), [shadowB])
  assert.equal(await shadowBoardForStaff(adminOfB, realTeam, shadowA), undefined)
  assert.equal(await shadowBoardForStaff(adminOfB, realTeam, shadowOfMember), undefined)
  assert.deepEqual(await readGrantedBoardIds({ userId: adminOfB, teamId: realTeam, projectId: null, customerId: null }), [shadowB])
})

test('an admin who manages no board sees no crew board, and cannot open one', async () => {
  assert.deepEqual(await shadowBoardIdsOfTeam(realTeam, adminOfNone), [])
  await assert.rejects(requireProject(eventOf(adminOfNone, realTeam), shadowA), (e: { statusCode?: number }) => e.statusCode === 404)
})

test('an ordinary member who set up a crew sees that crew board, and no other', async () => {
  assert.deepEqual(await shadowBoardIdsOfTeam(realTeam, memberWithCrew), [shadowOfMember])
  assert.equal(await isStaffOfShadowedBoard(memberWithCrew, shadowOfMember), true)
  assert.equal(await isStaffOfShadowedBoard(memberWithCrew, shadowA), false)
  const opened = await requireProject(eventOf(memberWithCrew, realTeam), shadowOfMember)
  assert.equal(opened.readOnly, true)
  await assert.rejects(requireProject(eventOf(memberWithCrew, realTeam), shadowA), (e: { statusCode?: number }) => e.statusCode === 404)
})

test('an ordinary member who set up no crew sees no crew board', async () => {
  assert.deepEqual(await shadowBoardIdsOfTeam(realTeam, memberPlain), [])
  assert.equal(await isStaffOfShadowedBoard(memberPlain, shadowA), false)
  await assert.rejects(requireProject(eventOf(memberPlain, realTeam), shadowA), (e: { statusCode?: number }) => e.statusCode === 404)
})

test('a guest of board A sees no crew board, even though the guest reads board A', async () => {
  assert.deepEqual(await readGrantedBoardIds({ userId: guest, teamId: null, projectId: null, customerId: null }), [])
  assert.equal(await isStaffOfShadowedBoard(guest, shadowA), false)
  await assert.rejects(requireProject(eventOf(guest, null), shadowA), (e: { statusCode?: number }) => e.statusCode === 404)
})

test('a customer contact sees no crew board of the customer\'s team', async () => {
  assert.deepEqual(await readGrantedBoardIds({ userId: contact, teamId: null, projectId: null, customerId: customer }), [])
  assert.equal(await isStaffOfShadowedBoard(contact, shadowA), false)
  await assert.rejects(requireProject(eventOf(contact, realTeam), shadowA), (e: { statusCode?: number }) => e.statusCode === 404)
})

test('the header of board A links to the crew boards its viewer may see, with the open task count', async () => {
  const forOwner = await crewBoardsOfRealBoard(owner, boardA)
  assert.deepEqual(sorted(forOwner.map(link => link.shadowProjectId)), sorted([shadowA, shadowOfMember]))
  const link = forOwner.find(item => item.shadowProjectId === shadowA)!
  assert.equal(link.name, 'Board A (crew)')
  assert.equal(link.crewName, 'Owner crew')
  // One task in the crew board's first column is open; the count goes up by one.
  const [first] = await db.select({ id: projectColumns.id }).from(projectColumns).where(eq(projectColumns.projectId, shadowA)).orderBy(asc(projectColumns.position))
  await db.insert(projectTasks).values({ id: id('open-task'), projectId: shadowA, columnId: first!.id, title: 'Open crew task', position: 0, createdAt: now, updatedAt: now })
  assert.equal((await crewBoardsOfRealBoard(owner, boardA)).find(item => item.shadowProjectId === shadowA)!.openTasks, 1)
  assert.deepEqual((await crewBoardsOfRealBoard(memberWithCrew, boardA)).map(item => item.shadowProjectId), [shadowOfMember])
})

test('the header of board A shows no crew board to a member who set up none, an admin of another board, or a stranger', async () => {
  assert.deepEqual(await crewBoardsOfRealBoard(memberPlain, boardA), [])
  assert.deepEqual(await crewBoardsOfRealBoard(adminOfB, boardA), [])
  assert.deepEqual(await crewBoardsOfRealBoard(stranger, boardA), [])
})

test('the board list and the pins hold the crew boards each role may read, and no others', async () => {
  assert.deepEqual(sorted(await shadowBoardIdsSeenBy(owner)), sorted([shadowA, shadowB, shadowOfMember]))
  assert.deepEqual(await shadowBoardIdsSeenBy(adminOfB), [shadowB])
  assert.deepEqual(await shadowBoardIdsSeenBy(memberWithCrew), [shadowOfMember])
  assert.deepEqual(await shadowBoardIdsSeenBy(memberPlain), [])
  assert.deepEqual(await shadowBoardIdsSeenBy(stranger), [])
  // A crew board the owner may read can be pinned, and it lists in the owner's pins in the real team.
  await pinBoard(owner, shadowA)
  try {
    const pin = (await listPins(owner)).find(item => item.projectId === shadowA)
    assert.equal(pin?.teamId, realTeam)
    await assert.rejects(pinBoard(memberPlain, shadowA), (e: { statusCode?: number }) => e.statusCode === 404)
  } finally {
    await unpinBoard(owner, shadowA)
  }
})

test('a person outside the team sees no crew board', async () => {
  assert.deepEqual(await shadowBoardIdsOfTeam(realTeam, stranger), [])
  assert.equal(await shadowBoardForStaff(stranger, realTeam, shadowA), undefined)
  await assert.rejects(requireProject(eventOf(stranger, null), shadowA), (e: { statusCode?: number }) => e.statusCode === 404)
})

test('every role that sees a crew board is refused a write on it', async () => {
  for (const who of [owner, adminOfA]) {
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      await assert.rejects(requireProject(eventOf(who, realTeam, method), shadowA), (e: { statusCode?: number }) => e.statusCode === 403, `${who} ${method}`)
    }
  }
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    await assert.rejects(requireProject(eventOf(memberWithCrew, realTeam, method), shadowOfMember), (e: { statusCode?: number }) => e.statusCode === 403, `member ${method}`)
  }
  // An admin who does not manage board A does not even see its crew board, so a write there is 404.
  await assert.rejects(requireProject(eventOf(adminOfB, realTeam, 'POST'), shadowA), (e: { statusCode?: number }) => e.statusCode === 404)
})
