// A claim accepts a pending board invitation, but it gives no guest row to someone who already has all the access a
// guest would get: the owner of the board, or a member of its team. Needs the test database. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_wynn node --import tsx --test tests/pending-invites-skip.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { member, organization, projectGuestInvitations, projectGuests, projects, user } = schema
const { claimPendingBoardInvites } = await import('../server/utils/pendingInvites')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `pis-${tag}-${name}`
const now = Date.now()
const later = now + 86_400_000

const owner = id('owner')
const mate = id('mate')
const team = id('team')
const board = id('board')
const ownerMail = `${owner}@staff.test`
const mateMail = `${mate}@staff.test`
const ownerInvite = id('owner-invite')
const mateInvite = id('mate-invite')
const users = [owner, mate]

before(async () => {
  const at = new Date(now)
  await db.insert(user).values([
    { id: owner, name: owner, email: ownerMail, emailVerified: true, createdAt: at, updatedAt: at },
    { id: mate, name: mate, email: mateMail, emailVerified: true, createdAt: at, updatedAt: at }
  ])
  await db.insert(organization).values({ id: team, name: 'Skip team', slug: team, createdAt: at })
  await db.insert(member).values([
    { id: id('m1'), organizationId: team, userId: owner, role: 'owner', createdAt: at },
    { id: id('m2'), organizationId: team, userId: mate, role: 'member', createdAt: at }
  ])
  await db.insert(projects).values({ id: board, userId: owner, teamId: team, name: 'Skip board', createdAt: now, updatedAt: now })
  await db.insert(projectGuestInvitations).values([
    { id: ownerInvite, projectId: board, email: ownerMail, role: 'editor', status: 'open', invitedBy: owner, createdAt: now, expiresAt: later },
    { id: mateInvite, projectId: board, email: mateMail, role: 'editor', status: 'open', invitedBy: owner, createdAt: now, expiresAt: later }
  ])
})

after(async () => {
  await db.delete(projectGuests).where(eq(projectGuests.projectId, board))
  await db.delete(projectGuestInvitations).where(inArray(projectGuestInvitations.id, [ownerInvite, mateInvite]))
  await db.delete(projects).where(eq(projects.id, board))
  await db.delete(member).where(eq(member.organizationId, team))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(user).where(inArray(user.id, users))
  await db.$client.end()
})

test('the owner of the board: the invitation is accepted, and no guest row is given', async () => {
  await claimPendingBoardInvites(owner, [ownerMail], now)
  const [row] = await db.select().from(projectGuestInvitations).where(eq(projectGuestInvitations.id, ownerInvite))
  assert.equal(row!.status, 'accepted')
  const guest = await db.select().from(projectGuests).where(and(eq(projectGuests.projectId, board), eq(projectGuests.userId, owner)))
  assert.equal(guest.length, 0)
})

test('a member of the board team: the invitation is accepted, and no guest row is given', async () => {
  await claimPendingBoardInvites(mate, [mateMail], now)
  const [row] = await db.select().from(projectGuestInvitations).where(eq(projectGuestInvitations.id, mateInvite))
  assert.equal(row!.status, 'accepted')
  const guest = await db.select().from(projectGuests).where(and(eq(projectGuests.projectId, board), eq(projectGuests.userId, mate)))
  assert.equal(guest.length, 0)
})
