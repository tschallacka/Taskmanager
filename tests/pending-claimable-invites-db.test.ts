// The sign-in claim counts the team and board invitations tied to the account's addresses, not only the customer ones
// (Quincy's FAIL on 6a9d3a1, Boss's ruling on mwn589pk): an account with only a team or a board invite must reach the
// claim on the projects page. The count is the number the page checks before it claims. Needs the test database. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_wynn node --import tsx --test tests/pending-claimable-invites-db.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { member, organization, projectGuestInvitations, projects, teamInvitations, user } = schema
const { countPendingTeamAndBoardInvites } = await import('../server/utils/pendingInvites')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `pci-${tag}-${name}`
const now = Date.now()
const later = now + 86_400_000
const earlier = now - 86_400_000

const owner = id('owner')
const invitee = id('invitee')
const inviteeMail = `${invitee}@guest.test`
const otherMail = `${id('other')}@guest.test`
const team = id('team')
const board = id('board')
const users = [owner, invitee]

before(async () => {
  const at = new Date(now)
  await db.insert(user).values([
    { id: owner, name: owner, email: `${owner}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at },
    { id: invitee, name: invitee, email: inviteeMail, emailVerified: true, createdAt: at, updatedAt: at }
  ])
  await db.insert(organization).values({ id: team, name: 'Claimable team', slug: team, createdAt: at })
  await db.insert(member).values({ id: id('m1'), organizationId: team, userId: owner, role: 'owner', createdAt: at })
  await db.insert(projects).values({ id: board, userId: owner, teamId: team, name: 'Claimable board', createdAt: now, updatedAt: now })
  await db.insert(teamInvitations).values([
    { id: id('team-open'), organizationId: team, email: inviteeMail, role: 'member', tokenHash: `${id('team-open')}-hash`, createdAt: now, expiresAt: later },
    { id: id('team-revoked'), organizationId: team, email: inviteeMail, role: 'member', tokenHash: `${id('team-revoked')}-hash`, createdAt: now, expiresAt: later, revokedAt: now },
    { id: id('team-other'), organizationId: team, email: otherMail, role: 'member', tokenHash: `${id('team-other')}-hash`, createdAt: now, expiresAt: later }
  ])
  await db.insert(projectGuestInvitations).values([
    { id: id('board-open'), projectId: board, email: inviteeMail, role: 'editor', status: 'open', invitedBy: owner, createdAt: now, expiresAt: later },
    { id: id('board-expired'), projectId: board, email: inviteeMail, role: 'editor', status: 'open', invitedBy: owner, createdAt: now, expiresAt: earlier },
    { id: id('board-other'), projectId: board, email: otherMail, role: 'editor', status: 'open', invitedBy: owner, createdAt: now, expiresAt: later }
  ])
})

after(async () => {
  await db.delete(projectGuestInvitations).where(eq(projectGuestInvitations.projectId, board))
  await db.delete(projects).where(eq(projects.id, board))
  await db.delete(teamInvitations).where(eq(teamInvitations.organizationId, team))
  await db.delete(member).where(eq(member.organizationId, team))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(user).where(inArray(user.id, users))
  await db.$client.end()
})

test('an account with only a team invite or only a board invite is counted, so the sign-in claim runs', async () => {
  assert.equal(await countPendingTeamAndBoardInvites([inviteeMail], now), 2)
})

test('only the invites to the given address count: the other address has its own two, and no address has none', async () => {
  assert.equal(await countPendingTeamAndBoardInvites([otherMail], now), 2)
  assert.equal(await countPendingTeamAndBoardInvites([], now), 0)
})
