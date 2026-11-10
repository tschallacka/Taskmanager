// Deleting a crew's shadow board (server/api/projects/[id]/crew-board.delete.ts): who may delete it, what goes with it, and
// what is refused. The rule: the board's owner or the team member its crew is coupled to (crews.created_by), an owner or
// admin of the board's team, or the instance admin. A crew account and a customer contact never; a shadow the person may
// not see is not found. Needs the test database and the Nuxt aliases:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_<key> node --import tsx --test --test-force-exit tests/crew-board-delete.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray, like } from 'drizzle-orm'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Nitro provides these as globals; the route, the auth middleware and the realtime helpers read them.
Object.assign(globalThis, {
  createError,
  defineEventHandler: (handler: unknown) => handler,
  getRouterParam: (event: { params: Record<string, string> }, key: string) => event.params[key],
  getRequestHeader: () => undefined,
  setHeader: () => {}
})

const { db } = await import('../server/db')
const { boardPins, crewBoardMembers, crewBoards, crews, customerMembers, customers, member, organization, projectColumns, projects, projectTasks, user } = await import('../server/db/schema')
const { crewBoardOf, mayDeleteCrewBoard } = await import('../server/utils/crewBoards')
const { auth } = await import('../server/lib/auth')
const { taskAttachmentDir } = await import('../server/utils/attachments')
const route = (await import('../server/api/projects/[id]/crew-board.delete')).default as unknown as (event: unknown) => Promise<{ ok: boolean }>
const requireAuth = (await import('../server/middleware/requireAuth')).default as unknown as (event: unknown) => Promise<void>

// The auth middleware asks the session store who is signed in; no session means a key or nothing was presented.
let sessionUser = ''
;(auth.api as unknown as { getSession: () => Promise<unknown> }).getSession = async () => (sessionUser ? { user: { id: sessionUser, email: `${sessionUser}@arnotes.test` } } : null)

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `cbd-${tag}-${name}`
const now = Date.now()
const at = new Date()

const owner = id('owner') // makes the crew, and owns its boards
const attacher = id('attacher') // a plain member of the crew's team who attached a board (it is the board's projects.user_id)
const teamAdmin = id('team-admin') // an admin of the crew's team, and of nothing else here
const crewMember = id('crew-member') // a plain member of the crew's team
const realAdmin = id('real-admin') // an admin of the real board's team only: sees the shadow, may not delete it
const realMember = id('real-member') // a plain member of the real board's team
const instanceAdmin = id('instance-admin') // the instance admin, and an owner of the real board's team only
const outsider = id('outsider')
const contact = id('contact') // a customer contact of the crew team's customer
const realTeam = id('real-team')
const crewTeam = id('crew-team')
const customer = id('customer')

const dirs: string[] = []
let seq = 0

/** A real board, and a crew's shadow board of it: a column and a task with a file, a fork member, a pin. */
async function crewBoardFor(createdBy: string, shadowOwner: string) {
  const n = ++seq
  const b = {
    real: id(`real-${n}`),
    shadow: id(`shadow-${n}`),
    column: id(`col-${n}`),
    task: `cbd${tag}t${n}`,
    crew: id(`crew-${n}`),
    link: id(`link-${n}`),
    fork: id(`fork-${n}`),
    forkUser: id(`fork-user-${n}`)
  }
  await db.insert(projects).values([
    { id: b.real, userId: owner, teamId: realTeam, name: `Real board ${n}`, createdAt: now, updatedAt: now },
    { id: b.shadow, userId: shadowOwner, teamId: crewTeam, name: `Real board ${n} (crew)`, createdAt: now, updatedAt: now }
  ])
  await db.insert(projectColumns).values({ id: b.column, projectId: b.shadow, name: 'To do', position: 0, createdAt: now })
  await db.insert(projectTasks).values({ id: b.task, projectId: b.shadow, columnId: b.column, title: 'Task', visibility: 'internal', position: 0, createdAt: now, updatedAt: now })
  await db.insert(crews).values({ id: b.crew, slug: `cbd-${tag}-${n}`, name: `Crew ${n}`, teamId: crewTeam, createdBy, createdAt: now })
  await db.insert(crewBoards).values({ id: b.link, crewId: b.crew, projectId: b.real, shadowProjectId: b.shadow, createdBy: shadowOwner, createdAt: now })
  await db.insert(user).values({ id: b.forkUser, name: b.forkUser, email: `${b.forkUser}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(crewBoardMembers).values({ id: b.fork, linkId: b.link, userId: b.forkUser, personKey: 'wren', agentType: `cbd-${n}-wren`, createdAt: now })
  await db.insert(boardPins).values({ userId: owner, projectId: b.shadow, createdAt: now })
  const dir = taskAttachmentDir(b.task)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'pic.png'), 'not really a png')
  dirs.push(dir)
  return b
}

/** The delete route, as `userId` with the crew's team as the active workspace. */
const del = (userId: string, boardId: string) => route({
  method: 'DELETE',
  params: { id: boardId },
  headers: new Headers(),
  context: { session: { user: { id: userId }, session: { activeOrganizationId: crewTeam } } }
})

const refused = (promise: Promise<unknown>, statusCode: number) =>
  assert.rejects(promise, (e: { statusCode?: number }) => e.statusCode === statusCode)

async function present(table: 'projects' | 'links', boardId: string): Promise<boolean> {
  if (table === 'links') return (await db.select({ id: crewBoards.id }).from(crewBoards).where(eq(crewBoards.shadowProjectId, boardId))).length > 0
  return (await db.select({ id: projects.id }).from(projects).where(eq(projects.id, boardId))).length > 0
}

/** Everything a delete takes with it is gone, and the real board it worked for stays. */
async function assertGone(b: Awaited<ReturnType<typeof crewBoardFor>>) {
  assert.equal(await present('projects', b.shadow), false, 'the shadow board row')
  assert.equal(await present('links', b.shadow), false, 'the crew_boards link')
  assert.equal((await db.select({ id: projectTasks.id }).from(projectTasks).where(eq(projectTasks.projectId, b.shadow))).length, 0, 'the tasks')
  assert.equal((await db.select({ id: projectColumns.id }).from(projectColumns).where(eq(projectColumns.projectId, b.shadow))).length, 0, 'the columns')
  assert.equal((await db.select({ id: user.id }).from(user).where(eq(user.id, b.forkUser))).length, 0, 'the forked member account')
  assert.equal((await db.select({ userId: boardPins.userId }).from(boardPins).where(eq(boardPins.projectId, b.shadow))).length, 0, 'the pins')
  assert.equal(existsSync(taskAttachmentDir(b.task)), false, 'the task files on disk')
  assert.equal(await present('projects', b.real), true, 'the real board stays')
}

before(async () => {
  await db.insert(user).values([owner, attacher, teamAdmin, crewMember, realAdmin, realMember, instanceAdmin, outsider, contact].map(u => ({
    id: u, name: u, email: `${u}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at, isInstanceAdmin: u === instanceAdmin
  })))
  await db.insert(organization).values([
    { id: realTeam, name: 'Real team', slug: realTeam, createdAt: at },
    { id: crewTeam, name: 'Crew team', slug: crewTeam, createdAt: at }
  ])
  await db.insert(member).values([
    { id: id('m-owner-crew'), organizationId: crewTeam, userId: owner, role: 'member', createdAt: at },
    { id: id('m-owner-real'), organizationId: realTeam, userId: owner, role: 'member', createdAt: at },
    { id: id('m-attacher'), organizationId: crewTeam, userId: attacher, role: 'member', createdAt: at },
    { id: id('m-team-admin'), organizationId: crewTeam, userId: teamAdmin, role: 'admin', createdAt: at },
    { id: id('m-crew-member'), organizationId: crewTeam, userId: crewMember, role: 'member', createdAt: at },
    { id: id('m-real-admin'), organizationId: realTeam, userId: realAdmin, role: 'admin', createdAt: at },
    { id: id('m-real-member'), organizationId: realTeam, userId: realMember, role: 'member', createdAt: at },
    { id: id('m-instance-admin'), organizationId: realTeam, userId: instanceAdmin, role: 'owner', createdAt: at }
  ])
  await db.insert(customers).values({ id: customer, organizationId: crewTeam, name: 'Customer', createdAt: now, updatedAt: now })
  await db.insert(customerMembers).values({ id: id('cm-contact'), customerId: customer, userId: contact, createdAt: now })
})

after(async () => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  await db.delete(organization).where(inArray(organization.id, [realTeam, crewTeam]))
  await db.delete(user).where(like(user.id, `cbd-${tag}-%`))
  await db.$client.end()
})

test('the board\'s owner deletes a crew board, and what hangs off it goes too', async () => {
  const b = await crewBoardFor(owner, owner)
  assert.deepEqual(await del(owner, b.shadow), { ok: true })
  await assertGone(b)
})

test('the team member the crew is coupled to deletes a board another member attached', async () => {
  // The board's projects.user_id is the person who attached it; the crew's created_by is the owner, who may delete.
  const b = await crewBoardFor(owner, attacher)
  assert.deepEqual(await del(owner, b.shadow), { ok: true })
  await assertGone(b)
})

test('an owner or admin of the crew\'s team deletes a crew board', async () => {
  const b = await crewBoardFor(owner, owner)
  assert.deepEqual(await del(teamAdmin, b.shadow), { ok: true })
  await assertGone(b)
})

test('the instance admin deletes a crew board', async () => {
  // The instance admin is an owner of the real board's team only: the shadow is visible to them, and only the instance
  // check lets them delete it.
  const b = await crewBoardFor(owner, owner)
  assert.deepEqual(await del(instanceAdmin, b.shadow), { ok: true })
  await assertGone(b)
})

test('a plain member is not found, and an admin of the real board\'s team only is refused', async () => {
  const b = await crewBoardFor(owner, owner)
  await refused(del(crewMember, b.shadow), 404) // hidden by hiddenCrewShadows
  await refused(del(realMember, b.shadow), 404) // hidden by hiddenCrewShadows
  await refused(del(realAdmin, b.shadow), 403) // sees it, but is no admin of the crew's team
  assert.equal(await present('projects', b.shadow), true)
})

test('a crew account, a customer contact and an outsider never delete it', async () => {
  const b = await crewBoardFor(owner, owner)
  // A crew account of this crew sees the crew's board, and is refused whatever its role.
  const account = id(`crew-account-${seq}`)
  await db.insert(user).values({ id: account, name: account, email: `${account}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at, crewId: b.crew })
  await refused(del(account, b.shadow), 403)
  await refused(del(contact, b.shadow), 404)
  await refused(del(outsider, b.shadow), 404)
  assert.equal(await present('projects', b.shadow), true)
})

test('a crew key is refused by the sign-in check before the route runs', async () => {
  const b = await crewBoardFor(owner, owner)
  sessionUser = ''
  const event = {
    path: `/api/projects/${b.shadow}/crew-board`,
    method: 'DELETE',
    headers: new Headers({ authorization: 'Bearer arn_crew_key_for_test' })
  }
  await refused(requireAuth(event), 401)
  assert.equal(await present('projects', b.shadow), true)
})

test('a board that is not a crew\'s shadow is not found by this route', async () => {
  const b = await crewBoardFor(owner, owner)
  await refused(del(owner, b.real), 404)
  assert.equal(await present('projects', b.real), true)
})

test('the crew board rule answers the same for the list flag as for the route', async () => {
  const b = await crewBoardFor(owner, owner)
  const board = await crewBoardOf(b.shadow)
  assert.ok(board)
  assert.equal(await mayDeleteCrewBoard(owner, board), true, 'the crew\'s member, through the coupling')
  assert.equal(await mayDeleteCrewBoard(teamAdmin, board), true, 'an admin of the crew\'s team')
  assert.equal(await mayDeleteCrewBoard(instanceAdmin, board), true, 'the instance admin')
  assert.equal(await mayDeleteCrewBoard(attacher, board), false, 'a plain member who is neither the owner nor an admin')
  assert.equal(await mayDeleteCrewBoard(crewMember, board), false, 'a plain member of the crew\'s team')
  assert.equal(await mayDeleteCrewBoard(realAdmin, board), false, 'an admin of the real board\'s team only')
})
