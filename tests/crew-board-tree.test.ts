// The crew tree of the board list (server/utils/boardTree.ts): a shadow board nests under its real board, for the
// real board's staff and for the crew's own members. The data is built the way crews were stored before the tree
// existed (no new column, no migration): an old crew with its shadow, an archived shadow, a "(crew)" board whose
// crew_boards row is missing, and the crew's home board. Needs the test database and the Nuxt aliases:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_<key> node --import tsx --test --test-force-exit tests/crew-board-tree.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

// Nitro provides createError as a global; the crew code expects it.
Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const { crewBoards, crews, member, organization, projects, user } = await import('../server/db/schema')
const { boardTreeFields, labelRowOf, treeNeighbours } = await import('../server/utils/boardTree')
const { requireProject } = await import('../server/utils/projects')

/** A GET from `userId` with `teamId` as the active workspace: what requireProject reads from an H3 event. */
const asUser = (userId: string, teamId: string) => ({
  method: 'GET',
  context: { session: { user: { id: userId }, session: { activeOrganizationId: teamId } } }
}) as unknown as Parameters<typeof requireProject>[0]

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `tbt-${tag}-${name}`
const now = Date.now()

const owner = id('owner')
const crewMember = id('crew-member')
const outsider = id('outsider')
// Staff of the real board's team and not in the crew's team: the shadow nests for them (the Q35a rule).
const realStaff = id('real-staff')
const realTeam = id('real-team')
const crewTeam = id('crew-team')

// The real boards, the shadows, the crews' homes and the stray "(crew)" board, as crews stored them.
const real = { taskmanager: id('real-taskmanager'), monocode: id('real-monocode') }
const shadow = {
  taskmanager: id('shadow-taskmanager'),
  monocode: id('shadow-monocode'),
  taken: id('shadow-taken'),
  stray: id('shadow-stray')
}
const home = { taskmanager: id('home-taskmanager'), monocode: id('home-monocode') }
const crew = { taskmanager: id('crew-taskmanager'), monocode: id('crew-monocode') }
const links = { taskmanager: id('link-taskmanager'), monocode: id('link-monocode'), taken: id('link-taken') }

const everyBoard = Object.values({ ...real, ...shadow, ...home })

before(async () => {
  const at = new Date()
  await db.insert(user).values([owner, crewMember, outsider, realStaff].map(u => ({ id: u, name: u, email: `${u}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })))
  await db.insert(organization).values([
    { id: realTeam, name: 'Real team', slug: realTeam, createdAt: at },
    { id: crewTeam, name: 'Crew team', slug: crewTeam, createdAt: at }
  ])
  // The owner is staff of the real team and of the crew team; the crew member is in the crew team only.
  await db.insert(member).values([
    { id: id('m-owner-real'), organizationId: realTeam, userId: owner, role: 'owner', createdAt: at },
    { id: id('m-owner-crew'), organizationId: crewTeam, userId: owner, role: 'admin', createdAt: at },
    { id: id('m-crew'), organizationId: crewTeam, userId: crewMember, role: 'member', createdAt: at },
    { id: id('m-real-staff'), organizationId: realTeam, userId: realStaff, role: 'member', createdAt: at }
  ])
  const board = (bid: string, teamId: string, name: string, extra: object = {}) =>
    ({ id: bid, userId: owner, teamId, name, createdAt: now, updatedAt: now, ...extra })
  await db.insert(projects).values([
    board(real.taskmanager, realTeam, 'Taskmanager Maintenance'),
    board(real.monocode, realTeam, 'Monocode'),
    board(shadow.taskmanager, crewTeam, 'Taskmanager Maintenance (crew)'),
    board(shadow.monocode, crewTeam, 'Monocode (crew)'),
    board(shadow.taken, crewTeam, 'Old crew (crew) (taken off)', { archivedAt: now }),
    board(shadow.stray, crewTeam, 'Stray (crew)'),
    board(home.taskmanager, crewTeam, 'taskmanager Development Center'),
    board(home.monocode, crewTeam, 'Monocode Development Center')
  ])
  await db.insert(crews).values([
    { id: crew.taskmanager, slug: `tm-${tag}`, name: 'taskmanager-maintenance', teamId: crewTeam, createdBy: owner, boardId: home.taskmanager, createdAt: now },
    { id: crew.monocode, slug: `mc-${tag}`, name: 'monocode', teamId: crewTeam, createdBy: owner, boardId: home.monocode, createdAt: now }
  ])
  // The crew member is one of the crew's own accounts (user.crewId), so it sees this crew's shadow, and no other.
  await db.update(user).set({ crewId: crew.taskmanager }).where(eq(user.id, crewMember))
  // Old-style links: one per crew and real board. The archived shadow keeps a leftover link from before the
  // detach that removed it; the stray "(crew)" board has no link at all.
  await db.insert(crewBoards).values([
    { id: links.taskmanager, crewId: crew.taskmanager, projectId: real.taskmanager, shadowProjectId: shadow.taskmanager, createdBy: owner, createdAt: now },
    { id: links.monocode, crewId: crew.monocode, projectId: real.monocode, shadowProjectId: shadow.monocode, createdBy: owner, createdAt: now + 1 },
    { id: links.taken, crewId: crew.taskmanager, projectId: real.monocode, shadowProjectId: shadow.taken, createdBy: owner, createdAt: now + 2 }
  ])
})

after(async () => {
  await db.delete(projects).where(inArray(projects.id, everyBoard.concat(shadow.taken, shadow.stray)))
  await db.delete(crews).where(inArray(crews.id, [crew.taskmanager, crew.monocode]))
  await db.delete(organization).where(inArray(organization.id, [realTeam, crewTeam]))
  await db.delete(user).where(inArray(user.id, [owner, crewMember, outsider, realStaff]))
  await db.$client.end()
})

/** The boards of one team, not archived: what a list holds before the tree adds anything. */
async function ownBoards(teamId: string): Promise<string[]> {
  const rows = await db.select({ id: projects.id, archivedAt: projects.archivedAt }).from(projects).where(eq(projects.teamId, teamId))
  return rows.filter(row => row.archivedAt === null).map(row => row.id)
}

/** The list the route would answer for `userId` in `teamId`, reduced to what the tests check. */
async function listFor(userId: string, teamId: string) {
  const raw = await ownBoards(teamId)
  const neighbours = await treeNeighbours(userId, raw)
  const own = raw.filter(boardId => !neighbours.hidden.has(boardId))
  const listed = [...own, ...neighbours.shadowIds, ...neighbours.realIds]
  const fields = await boardTreeFields(listed, new Set(listed))
  const readOnly = new Set([...neighbours.shadowIds, ...neighbours.realIds])
  return { listed, fields, readOnly, neighbours }
}

test('the owner sees each real board with its crew shadow nested under it, and the crew home stays put', async () => {
  const { listed, fields, readOnly, neighbours } = await listFor(owner, realTeam)
  // The owner is in the crew team too: the shadows come in, read-only from the real team's workspace.
  assert.deepEqual([...neighbours.shadowIds].sort(), [shadow.monocode, shadow.taskmanager].sort())
  assert.deepEqual(neighbours.realIds, [])
  assert.ok(readOnly.has(shadow.taskmanager) && readOnly.has(shadow.monocode))
  assert.ok(!listed.includes(shadow.taken), 'an archived shadow is never added to the list')

  const taskmanager = fields.get(real.taskmanager)!
  assert.equal(taskmanager.role, 'real')
  assert.deepEqual(taskmanager.shadows.map(s => s.id), [shadow.taskmanager])
  assert.deepEqual(taskmanager.shadows[0], { id: shadow.taskmanager, name: 'Taskmanager Maintenance (crew)', crewId: crew.taskmanager, crewName: 'taskmanager-maintenance', crewSlug: `tm-${tag}` })

  const shadowRow = fields.get(shadow.taskmanager)!
  assert.equal(shadowRow.role, 'shadow')
  assert.deepEqual(shadowRow.realBoard, { id: real.taskmanager, name: 'Taskmanager Maintenance' })
  assert.equal(shadowRow.crew?.id, crew.taskmanager)
  assert.equal(fields.get(real.monocode)!.shadows[0]?.id, shadow.monocode)
})

test('a crew member sees the shadow under the real board, which is read-only for them', async () => {
  const { listed, fields, readOnly, neighbours } = await listFor(crewMember, crewTeam)
  // The crew member is one of this crew's accounts: its own crew's real board comes in as a label row, and the other
  // crew's shadow (and so its real board) stays out of the tree.
  assert.deepEqual([...neighbours.realIds], [real.taskmanager])
  assert.deepEqual(neighbours.shadowIds, [])
  assert.ok(readOnly.has(real.taskmanager))
  assert.ok(!readOnly.has(real.monocode))
  assert.ok(listed.includes(shadow.taskmanager))
  assert.ok(!listed.includes(shadow.monocode), 'the other crew\'s shadow is not shown to this crew account')

  assert.deepEqual(fields.get(real.taskmanager)!.shadows.map(s => s.id), [shadow.taskmanager])
  // The crew's home board stays where it is: in the crew's own team, labelled, never nested.
  assert.equal(fields.get(home.monocode)!.role, 'crew_home')
  assert.equal(fields.get(home.monocode)!.crew?.name, 'monocode')
  assert.equal(fields.get(home.taskmanager)!.crew?.name, 'taskmanager-maintenance')
  assert.equal(fields.get(home.taskmanager)!.realBoard, null)
  assert.deepEqual(fields.get(home.taskmanager)!.shadows, [])
})

test('a crew member gets 404 on the real board, so its internal comments stay out of reach', async () => {
  // The real board is a label row in the crew member's tree only: opening it, or any endpoint that loads it
  // (comments, tasks, the board), goes through requireProject, which answers 404 for the crew's team.
  await assert.rejects(requireProject(asUser(crewMember, crewTeam), real.taskmanager), (e: { statusCode?: number }) => e.statusCode === 404)
  await assert.rejects(requireProject(asUser(crewMember, crewTeam), real.monocode), (e: { statusCode?: number }) => e.statusCode === 404)
  // The crew's own shadow board stays open to the crew, as before.
  assert.equal((await requireProject(asUser(crewMember, crewTeam), shadow.taskmanager)).id, shadow.taskmanager)
  // The real board's staff still open it as staff.
  const asStaff = await requireProject(asUser(owner, realTeam), real.taskmanager)
  assert.equal(asStaff.readOnly, false)
})

test('a "(crew)" board whose crew_boards row is missing stays top level, with no role of its own', async () => {
  const { listed, fields, neighbours } = await listFor(crewMember, crewTeam)
  assert.ok(listed.includes(shadow.stray), 'the stray board is still listed')
  const stray = fields.get(shadow.stray)!
  assert.equal(stray.role, 'board')
  assert.equal(stray.realBoard, null)
  assert.equal(stray.crew, null)
  assert.ok(!neighbours.realIds.includes(shadow.stray) && !neighbours.shadowIds.includes(shadow.stray))
})

test('an archived shadow with a leftover link is not nested, and an outsider sees no tree', async () => {
  const outsiderNeighbours = await treeNeighbours(outsider, await ownBoards(crewTeam))
  assert.deepEqual([outsiderNeighbours.shadowIds, outsiderNeighbours.realIds], [[], []])
  const outsiderOwn = await treeNeighbours(outsider, await ownBoards(realTeam))
  assert.deepEqual([outsiderOwn.shadowIds, outsiderOwn.realIds], [[], []])

  // The archived shadow is named by its link, so it reads as a shadow on its own page, but no real board lists it.
  const { fields } = await listFor(owner, realTeam)
  assert.equal(fields.get(real.monocode)!.shadows.some(s => s.id === shadow.taken), false)
})

test('real-board staff who are not crew owners, team admins or crew accounts do not see the shadow', async () => {
  // Crew boards are seen only by the crew's owner, the owners and admins of the team they live in, and the crew's own
  // accounts. Staff of the real board's team alone get no shadow nested, and no shadow row either.
  const staff = await listFor(realStaff, realTeam)
  assert.deepEqual(staff.neighbours.shadowIds, [])
  assert.deepEqual(staff.fields.get(real.taskmanager)!.shadows, [])
  assert.ok(!staff.listed.includes(shadow.taskmanager) && !staff.listed.includes(shadow.monocode))
  // The crew's owner, who made the crews, sees them: the owner view above.
  const ownerView = await listFor(owner, realTeam)
  assert.ok(ownerView.listed.includes(shadow.taskmanager))
})

test('a label row for a crew member carries only id, name, role, readOnly and updatedAt', async () => {
  const source = { id: real.taskmanager, name: 'Taskmanager Maintenance', updatedAt: now, description: 'internal notes', customerName: 'Acme', isPublic: true, crewsAllowed: true }
  assert.deepEqual(Object.keys(labelRowOf(source)).sort(), ['id', 'name', 'readOnly', 'role', 'updatedAt'])
  assert.deepEqual(labelRowOf(source), { id: real.taskmanager, name: 'Taskmanager Maintenance', role: 'real', readOnly: true, updatedAt: now })
})

test('a board that is a shadow for one crew and a real board for another keeps the shadow role, whatever the row order', async () => {
  const x = id('board-x')
  const y = id('board-y')
  const linkShadow = id('link-x-shadow')
  const linkReal = id('link-x-real')
  await db.insert(projects).values([
    { id: x, userId: owner, teamId: crewTeam, name: 'X (crew)', createdAt: now, updatedAt: now },
    { id: y, userId: owner, teamId: crewTeam, name: 'Y (crew)', createdAt: now, updatedAt: now }
  ])
  // The shadow link is the earlier row, so the real link comes second: the order that overwrote the role before.
  await db.insert(crewBoards).values([
    { id: linkShadow, crewId: crew.monocode, projectId: real.taskmanager, shadowProjectId: x, createdBy: owner, createdAt: now },
    { id: linkReal, crewId: crew.taskmanager, projectId: x, shadowProjectId: y, createdBy: owner, createdAt: now + 5 }
  ])
  try {
    const fields = await boardTreeFields([real.taskmanager, x, y], new Set([real.taskmanager, x, y]))
    assert.equal(fields.get(x)!.role, 'shadow')
    assert.equal(fields.get(x)!.realBoard?.id, real.taskmanager)
    assert.equal(fields.get(real.taskmanager)!.role, 'real')
  } finally {
    await db.delete(crewBoards).where(inArray(crewBoards.id, [linkShadow, linkReal]))
    await db.delete(projects).where(inArray(projects.id, [x, y]))
  }
})
