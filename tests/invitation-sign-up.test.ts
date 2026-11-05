// A closed instance admits a new account on a team invitation only when the account has the invited
// address, and, when it comes from a sign-in provider (Google, GitHub, Discord, OIDC), only when the
// provider verified that address. Needs the dev database and the Nuxt aliases. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/invitation-sign-up.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'

const { db } = await import('../server/db')
const { member, organization, teamInvitations, user } = await import('../server/db/schema')
const { newInvitationToken } = await import('../server/utils/customers')
const { admitsSignUp } = await import('../server/utils/ownerOrganization')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `tis-${tag}-${name}`
const now = Date.now()
const HOUR = 60 * 60 * 1000

const owner = id('owner')
const team = id('team')
const address = `Sam.Lee-${tag}@Example.test`

const live = newInvitationToken()
const expired = newInvitationToken()
const withdrawn = newInvitationToken()

before(async () => {
  const at = new Date()
  await db.insert(user).values({ id: owner, name: owner, email: `${owner}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(organization).values({ id: team, name: 'Pass team', slug: team, createdAt: at })
  await db.insert(member).values({ id: id('m1'), organizationId: team, userId: owner, role: 'owner', createdAt: at })
  const invitation = (name: string, token: { tokenHash: string }, extra: Partial<typeof teamInvitations.$inferInsert> = {}) => ({
    id: id(name),
    organizationId: team,
    email: address.toLowerCase(),
    role: 'member',
    tokenHash: token.tokenHash,
    invitedBy: owner,
    createdAt: now,
    expiresAt: now + HOUR,
    ...extra
  })
  await db.insert(teamInvitations).values([
    invitation('live', live),
    invitation('expired', expired, { expiresAt: now - HOUR }),
    invitation('withdrawn', withdrawn, { revokedAt: now })
  ])
})

after(async () => {
  await db.delete(teamInvitations).where(eq(teamInvitations.organizationId, team))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(user).where(inArray(user.id, [owner]))
  await db.$client.end()
})

test('the invited address is admitted, whatever its capitals', async () => {
  assert.equal(await admitsSignUp(live.token, address.toLowerCase(), null), true)
  assert.equal(await admitsSignUp(live.token, address, null), true)
  assert.equal(await admitsSignUp(live.token, `  ${address.toUpperCase()} `, null), true)
})

test('any other address is refused, even with a live link', async () => {
  assert.equal(await admitsSignUp(live.token, `someone-${tag}@example.test`, null), false)
  assert.equal(await admitsSignUp(live.token, `sam.lee-${tag}@example.test.evil.test`, null), false)
  assert.equal(await admitsSignUp(live.token, '', null), false)
})

test('an account from a sign-in provider needs the provider to have verified the address', async () => {
  assert.equal(await admitsSignUp(live.token, address, { verified: true }), true)
  assert.equal(await admitsSignUp(live.token, address, { verified: false }), false)
  assert.equal(await admitsSignUp(live.token, `someone-${tag}@example.test`, { verified: true }), false, 'a verified other address is still another address')
})

test('no link, an unknown link, an expired one and a withdrawn one admit nobody', async () => {
  assert.equal(await admitsSignUp(null, address, null), false)
  assert.equal(await admitsSignUp(newInvitationToken().token, address, null), false)
  assert.equal(await admitsSignUp(expired.token, address, null), false)
  assert.equal(await admitsSignUp(withdrawn.token, address, null), false)
})
