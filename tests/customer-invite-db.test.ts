// The later sign-in and the claim of a customer link tied to an address, on the database: an account with that address
// is accepted as a contact by itself; a second claim adds nothing; an anonymous link and another address are left alone.
// Needs the test database with the email column (SCHEMA CHANGED). Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_wynn node --import tsx --test tests/customer-invite-db.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { customerInvitations, customerMembers, customers, organization, user } = schema
const { claimTiedCustomerInvites } = await import('../server/utils/pendingInvites')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `cid-${tag}-${name}`
const now = Date.now()
const later = now + 86_400_000

const owner = id('owner')
const person = id('person')
const org = id('org')
const customer = id('customer')
const personMail = `${person}@guest.test`
const tiedId = id('tied')
const anonId = id('anon')
const otherId = id('other')
const users = [owner, person]

before(async () => {
  const at = new Date(now)
  await db.insert(user).values([
    { id: owner, name: owner, email: `${owner}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at },
    { id: person, name: person, email: personMail, emailVerified: true, createdAt: at, updatedAt: at }
  ])
  await db.insert(organization).values({ id: org, name: 'Customer org', slug: org, createdAt: at })
  await db.insert(customers).values({ id: customer, organizationId: org, name: 'Customer', createdAt: now, updatedAt: now })
  await db.insert(customerInvitations).values([
    { id: tiedId, customerId: customer, tokenHash: `h-${tag}-tied`, email: personMail, createdBy: owner, createdAt: now, expiresAt: later },
    { id: anonId, customerId: customer, tokenHash: `h-${tag}-anon`, email: null, createdBy: owner, createdAt: now, expiresAt: later },
    { id: otherId, customerId: customer, tokenHash: `h-${tag}-other`, email: `other-${tag}@guest.test`, createdBy: owner, createdAt: now, expiresAt: later }
  ])
})

after(async () => {
  await db.delete(customerMembers).where(eq(customerMembers.customerId, customer))
  await db.delete(customerInvitations).where(inArray(customerInvitations.id, [tiedId, anonId, otherId]))
  await db.delete(customers).where(eq(customers.id, customer))
  await db.delete(organization).where(eq(organization.id, org))
  await db.delete(user).where(inArray(user.id, users))
  await db.$client.end()
})

test('the later sign-in claims the tied link: the account becomes a contact, and the link is used', async () => {
  await claimTiedCustomerInvites(person, [personMail], now)
  const [row] = await db.select().from(customerInvitations).where(eq(customerInvitations.id, tiedId))
  assert.equal(row!.acceptedBy, person)
  assert.notEqual(row!.acceptedAt, null)
  const contact = await db.select().from(customerMembers).where(and(eq(customerMembers.customerId, customer), eq(customerMembers.userId, person)))
  assert.equal(contact.length, 1)
})

test('a second claim adds no second contact row', async () => {
  await claimTiedCustomerInvites(person, [personMail], now)
  const contact = await db.select().from(customerMembers).where(and(eq(customerMembers.customerId, customer), eq(customerMembers.userId, person)))
  assert.equal(contact.length, 1)
})

test('an anonymous link and another address are left alone', async () => {
  const [anon] = await db.select().from(customerInvitations).where(eq(customerInvitations.id, anonId))
  const [other] = await db.select().from(customerInvitations).where(eq(customerInvitations.id, otherId))
  assert.equal(anon!.acceptedAt, null)
  assert.equal(other!.acceptedAt, null)
})
