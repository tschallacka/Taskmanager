// Where a board opens for a person (server/utils/workspaces.ts workspaceOf, behind GET /api/projects/:id/workspace):
// a personal board, a team board of a team they are in, a board shared with them as a guest, a customer's board, a
// crew's shadow board for the staff of its real board, and a stranger who gets nothing. Needs a scratch database
// (arnotes_test_<key>); it writes rows with a random tag and removes them. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_<key> node --import tsx --test --test-force-exit tests/workspace-board-open.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'

const { db } = await import('../server/db')
const { crewBoards, crews, customerMembers, customers, member, organization, projectGuests, projects, user } = await import('../server/db/schema')
const { workspaceOf } = await import('../server/utils/workspaces')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `wbo-${tag}-${name}`
const now = Date.now()
const at = new Date()

const caller = id('caller') // a member of team A, and a customer contact of a board in team C
const owner = id('owner') // owns the personal board and the guest board
const stranger = id('stranger') // no relation to any of the boards
const teamA = id('team-a') // the caller is a member
const teamB = id('team-b') // the caller is not a member; the guest board and the staff of the shadow's real board live here
const teamC = id('team-c') // holds the customer's board
const crewTeam = id('crew-team') // the crew's own team: the shadow board sits here

const personalBoard = id('personal')
const teamBoard = id('team-board') // in team A
const guestBoard = id('guest-board') // in team B, shared with the caller as a guest
const customerBoard = id('customer-board') // in team C, for the customer the caller logs in for
const customerId = id('customer')
const realBoard = id('real') // in team A: the caller is staff of it
const shadowBoard = id('shadow') // the crew's shadow of realBoard, in the crew team
const crewId = id('crew')

before(async () => {
  await db.insert(user).values([caller, owner, stranger].map(u => ({
    id: u, name: u, email: `${u}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at
  })))
  await db.insert(organization).values([
    { id: teamA, name: 'Team A (open test)', slug: teamA, createdAt: at },
    { id: teamB, name: 'Team B (open test)', slug: teamB, createdAt: at },
    { id: teamC, name: 'Team C (open test)', slug: teamC, createdAt: at },
    { id: crewTeam, name: 'Crew team (open test)', slug: crewTeam, createdAt: at }
  ])
  await db.insert(member).values([
    { id: id('m-caller-a'), organizationId: teamA, userId: caller, role: 'member', createdAt: at },
    { id: id('m-owner-b'), organizationId: teamB, userId: owner, role: 'owner', createdAt: at }
  ])
  await db.insert(customers).values({ id: customerId, organizationId: teamC, name: 'Customer (open test)', createdAt: now, updatedAt: now })
  await db.insert(customerMembers).values({ id: id('cm'), customerId, userId: caller, createdAt: now })
  await db.insert(projects).values([
    { id: personalBoard, userId: owner, teamId: null, name: 'Personal', createdAt: now, updatedAt: now },
    { id: teamBoard, userId: owner, teamId: teamA, name: 'Team A board', createdAt: now, updatedAt: now },
    { id: guestBoard, userId: owner, teamId: teamB, name: 'Guest board', createdAt: now, updatedAt: now },
    { id: customerBoard, userId: owner, teamId: teamC, customerId, name: 'Customer board', createdAt: now, updatedAt: now },
    { id: realBoard, userId: owner, teamId: teamA, name: 'Real board', createdAt: now, updatedAt: now },
    { id: shadowBoard, userId: owner, teamId: crewTeam, name: 'Shadow (crew)', createdAt: now, updatedAt: now }
  ])
  await db.insert(projectGuests).values({ id: id('guest'), projectId: guestBoard, userId: caller, role: 'viewer', createdAt: now })
  await db.insert(crews).values({ id: crewId, slug: `wbo-${tag}`, name: 'Open test crew', teamId: crewTeam, createdBy: owner, createdAt: now })
  await db.insert(crewBoards).values({ id: id('link'), crewId, projectId: realBoard, shadowProjectId: shadowBoard, createdAt: now })
})

after(async () => {
  await db.delete(crewBoards).where(eq(crewBoards.crewId, crewId))
  await db.delete(crews).where(eq(crews.id, crewId))
  await db.delete(projects).where(inArray(projects.id, [personalBoard, teamBoard, guestBoard, customerBoard, realBoard, shadowBoard]))
  await db.delete(customers).where(eq(customers.id, customerId))
  await db.delete(organization).where(inArray(organization.id, [teamA, teamB, teamC, crewTeam]))
  await db.delete(user).where(inArray(user.id, [caller, owner, stranger]))
})

test('a personal board opens in the personal workspace for its owner', async () => {
  assert.deepEqual(await workspaceOf(owner, personalBoard), { teamId: null, teamName: null })
})

test('a team board opens in its team for a member of that team, whatever workspace they are in', async () => {
  assert.deepEqual(await workspaceOf(caller, teamBoard), { teamId: teamA, teamName: 'Team A (open test)' })
})

test('a board shared with a person as a guest opens in the personal workspace, even from another team', async () => {
  assert.deepEqual(await workspaceOf(caller, guestBoard), { teamId: null, teamName: null })
})

test('a customer contact\'s board opens in the personal workspace', async () => {
  assert.deepEqual(await workspaceOf(caller, customerBoard), { teamId: null, teamName: null })
})

test('a crew\'s shadow board opens in the team of its real board, for the staff of that board', async () => {
  assert.deepEqual(await workspaceOf(caller, shadowBoard), { teamId: teamA, teamName: 'Team A (open test)' })
})

test('a stranger gets nothing for any of these boards: the route answers 404', async () => {
  for (const boardId of [personalBoard, teamBoard, guestBoard, customerBoard, shadowBoard]) {
    assert.equal(await workspaceOf(stranger, boardId), null)
  }
})

test('a board that does not exist gets nothing', async () => {
  assert.equal(await workspaceOf(caller, id('missing')), null)
})
