// The write path of the pending board invitations: a claim accepts the invitation, gives the account a guest row, and
// stops offering it again; the invite page's count lists the projects, each once. Needs the test database. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_wynn node --import tsx --test tests/pending-invites-db.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { member, organization, projectGuestInvitations, projectGuests, projects, user } = schema
const { claimPendingBoardInvites, pendingBoardProjectIdsFor } = await import('../server/utils/pendingInvites')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `pib-${tag}-${name}`
const now = Date.now()
const later = now + 86_400_000
const earlier = now - 86_400_000

const owner = id('owner')
const invitee = id('invitee')
const team = id('team')
const board = id('board')
const inviteeMail = `${invitee}@guest.test`
const pendingId = id('pending')
const expiredId = id('expired')
const otherId = id('other')
const users = [owner, invitee]

before(async () => {
  const at = new Date(now)
  await db.insert(user).values([
    { id: owner, name: owner, email: `${owner}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at },
    { id: invitee, name: invitee, email: inviteeMail, emailVerified: true, createdAt: at, updatedAt: at }
  ])
  await db.insert(organization).values({ id: team, name: 'Pending team', slug: team, createdAt: at })
  await db.insert(member).values({ id: id('m1'), organizationId: team, userId: owner, role: 'owner', createdAt: at })
  await db.insert(projects).values({ id: board, userId: owner, teamId: team, name: 'Pending board', createdAt: now, updatedAt: now })
  await db.insert(projectGuestInvitations).values([
    { id: pendingId, projectId: board, email: inviteeMail, role: 'editor', status: 'open', invitedBy: owner, createdAt: now, expiresAt: later },
    { id: expiredId, projectId: board, email: inviteeMail, role: 'editor', status: 'open', invitedBy: owner, createdAt: now, expiresAt: earlier },
    { id: otherId, projectId: board, email: `someone-else-${tag}@guest.test`, role: 'editor', status: 'open', invitedBy: owner, createdAt: now, expiresAt: later }
  ])
})

after(async () => {
  await db.delete(projectGuests).where(eq(projectGuests.projectId, board))
  await db.delete(projectGuestInvitations).where(inArray(projectGuestInvitations.id, [pendingId, expiredId, otherId]))
  await db.delete(projects).where(eq(projects.id, board))
  await db.delete(member).where(eq(member.organizationId, team))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(user).where(inArray(user.id, users))
  await db.$client.end()
})

test('before a claim, the invitation to the account is counted once, by its project', async () => {
  assert.deepEqual(await pendingBoardProjectIdsFor([inviteeMail], now), [board])
})

test('a claim accepts the invitation and gives the account a guest row on the board', async () => {
  await claimPendingBoardInvites(invitee, [inviteeMail], now)
  const [row] = await db.select().from(projectGuestInvitations).where(eq(projectGuestInvitations.id, pendingId))
  assert.equal(row!.status, 'accepted')
  assert.equal(row!.acceptedBy, invitee)
  const guest = await db.select().from(projectGuests).where(and(eq(projectGuests.projectId, board), eq(projectGuests.userId, invitee)))
  assert.equal(guest.length, 1)
  assert.equal(guest[0]!.role, 'editor')
})

test('an expired invitation and another address are left alone', async () => {
  const [expired] = await db.select().from(projectGuestInvitations).where(eq(projectGuestInvitations.id, expiredId))
  const [other] = await db.select().from(projectGuestInvitations).where(eq(projectGuestInvitations.id, otherId))
  assert.equal(expired!.status, 'open')
  assert.equal(other!.status, 'open')
})

test('after the claim, nothing is offered again', async () => {
  assert.deepEqual(await pendingBoardProjectIdsFor([inviteeMail], now), [])
  await claimPendingBoardInvites(invitee, [inviteeMail], now)
  const guest = await db.select().from(projectGuests).where(and(eq(projectGuests.projectId, board), eq(projectGuests.userId, invitee)))
  assert.equal(guest.length, 1, 'a second claim adds no second guest row')
})
