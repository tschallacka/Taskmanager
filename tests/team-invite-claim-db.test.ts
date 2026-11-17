// A team invitation to a signed-in address is accepted by itself at sign-in (as a board or customer invitation is): the
// open one makes the account a member; a revoked one and one sent to another address do not. Needs the test database.
// Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_wynn node --import tsx --test tests/team-invite-claim-db.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { member, organization, teamInvitations, user } = schema
const { claimPendingTeamInvites } = await import('../server/utils/pendingInvites')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `tic-${tag}-${name}`
const now = Date.now()
const person = id('person')
const email = `${id('address')}@guest.test`
const otherEmail = `${id('other')}@guest.test`
const teamOpen = id('team-open')
const teamRevoked = id('team-revoked')
const teamOther = id('team-other')
const orgs = [teamOpen, teamRevoked, teamOther]

before(async () => {
  const at = new Date(now)
  await db.insert(user).values({ id: person, name: person, email, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(organization).values(orgs.map(orgId => ({ id: orgId, name: orgId, slug: orgId, createdAt: at })))
  await db.insert(teamInvitations).values([
    { id: id('open'), organizationId: teamOpen, email, role: 'member', tokenHash: `${id('open')}-hash`, createdAt: now, expiresAt: now + 86_400_000 },
    { id: id('revoked'), organizationId: teamRevoked, email, role: 'member', tokenHash: `${id('revoked')}-hash`, createdAt: now, expiresAt: now + 86_400_000, revokedAt: now },
    { id: id('other'), organizationId: teamOther, email: otherEmail, role: 'member', tokenHash: `${id('other')}-hash`, createdAt: now, expiresAt: now + 86_400_000 }
  ])
})

after(async () => {
  await db.delete(member).where(inArray(member.organizationId, orgs))
  await db.delete(teamInvitations).where(inArray(teamInvitations.organizationId, orgs))
  await db.delete(organization).where(inArray(organization.id, orgs))
  await db.delete(user).where(eq(user.id, person))
  await db.$client.end()
})

test('a later sign-in makes the account a member of the team it was invited to, and only that team', async () => {
  await claimPendingTeamInvites(person, [email], Date.now())
  const [open] = await db.select({ acceptedAt: teamInvitations.acceptedAt }).from(teamInvitations).where(eq(teamInvitations.id, id('open')))
  assert.notEqual(open!.acceptedAt, null)
  const [joined] = await db.select({ id: member.id }).from(member).where(and(eq(member.organizationId, teamOpen), eq(member.userId, person)))
  assert.ok(joined)
})

test('a revoked team invitation is not claimed, and an invitation to another address is not claimed', async () => {
  const [revoked] = await db.select({ acceptedAt: teamInvitations.acceptedAt }).from(teamInvitations).where(eq(teamInvitations.id, id('revoked')))
  assert.equal(revoked!.acceptedAt, null)
  const [other] = await db.select({ acceptedAt: teamInvitations.acceptedAt }).from(teamInvitations).where(eq(teamInvitations.id, id('other')))
  assert.equal(other!.acceptedAt, null)
  const members = await db.select({ id: member.id }).from(member).where(and(eq(member.organizationId, teamRevoked), eq(member.userId, person)))
  assert.equal(members.length, 0)
})
