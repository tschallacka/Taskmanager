// A revoked customer link is not claimed by a later sign-in of its address; an open link to the same address still is.
// Needs the test database with the revoked_at column. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_wynn node --import tsx --test tests/customer-revoke-db.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { customerInvitations, customers, organization, user } = schema
const { claimTiedCustomerInvites } = await import('../server/utils/pendingInvites')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `rev-${tag}-${name}`
const now = Date.now()
const person = id('person')
const team = id('team')
const customer = id('customer')
const email = `${id('address')}@guest.test`
const open = id('open')
const revoked = id('revoked')
const users = [person]

before(async () => {
  const at = new Date(now)
  await db.insert(user).values({ id: person, name: person, email, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(organization).values({ id: team, name: 'Revoke team', slug: team, createdAt: at })
  await db.insert(customers).values({ id: customer, organizationId: team, name: 'Revoke customer', createdAt: now, updatedAt: now })
  await db.insert(customerInvitations).values([
    { id: open, customerId: customer, tokenHash: `${open}-hash`, email, createdAt: now, expiresAt: now + 86_400_000 },
    { id: revoked, customerId: customer, tokenHash: `${revoked}-hash`, email, createdAt: now, expiresAt: now + 86_400_000, revokedAt: now }
  ])
})

after(async () => {
  await db.delete(customerInvitations).where(eq(customerInvitations.customerId, customer))
  await db.delete(customers).where(eq(customers.id, customer))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(user).where(inArray(user.id, users))
  await db.$client.end()
})

test('a later sign-in claims the open link and not the revoked one', async () => {
  await claimTiedCustomerInvites(person, [email], Date.now())
  const [openRow] = await db.select({ acceptedAt: customerInvitations.acceptedAt }).from(customerInvitations).where(eq(customerInvitations.id, open))
  const [revokedRow] = await db.select({ acceptedAt: customerInvitations.acceptedAt }).from(customerInvitations).where(eq(customerInvitations.id, revoked))
  assert.notEqual(openRow!.acceptedAt, null)
  assert.equal(revokedRow!.acceptedAt, null)
})
