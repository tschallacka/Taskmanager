// The refusals before a deletion (card mwjfpokj5rvl92bserd, the owner rule and the admin rule): an owner of a team cannot
// delete the account while they own it (the teams are named); the last instance admin cannot; a crew account cannot.
// Nothing is removed by a refused deletion. Needs the test database and the Nuxt aliases. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_wren node --import tsx --test --test-force-exit tests/account-deletion-refusal.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { deleteAccount, accountRefusal } = await import('../server/utils/accountDeletion')
const { user, organization, member } = schema

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `ref-${tag}-${name}`
const at = new Date()
const ownerOfTeam = id('owner')
const handedOver = id('handed-over')
const soleAdmin = id('sole-admin')
const crewAccount = id('crew-account')
const teamA = id('team-a')
const teamB = id('team-b')

before(async () => {
  await db.insert(user).values([
    { id: ownerOfTeam, name: 'Team owner', email: `${ownerOfTeam}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at },
    { id: handedOver, name: 'Handed over', email: `${handedOver}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at },
    { id: soleAdmin, name: 'Sole admin', email: `${soleAdmin}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at, isInstanceAdmin: true },
    { id: crewAccount, name: 'Crew account', email: `${crewAccount}@crew.invalid`, emailVerified: true, createdAt: at, updatedAt: at }
  ])
  await db.insert(organization).values([
    { id: teamA, name: 'Owner team', slug: teamA, createdAt: at },
    { id: teamB, name: 'Handed-over team', slug: teamB, createdAt: at }
  ])
  await db.insert(member).values([
    { id: id('m1'), organizationId: teamA, userId: ownerOfTeam, role: 'owner', createdAt: at },
    { id: id('m2'), organizationId: teamB, userId: handedOver, role: 'admin', createdAt: at }
  ])
})

after(async () => {
  await db.delete(organization).where(inArray(organization.id, [teamA, teamB]))
  await db.delete(user).where(inArray(user.id, [ownerOfTeam, handedOver, soleAdmin, crewAccount]))
  await db.$client.end()
})

test('a team owner is refused, and the team is named; nothing is removed', async () => {
  const refusal = await accountRefusal(ownerOfTeam)
  assert.ok(refusal, 'refused')
  assert.deepEqual(refusal?.teams, [{ id: teamA, name: 'Owner team' }])
  await assert.rejects(deleteAccount(ownerOfTeam), (error: { statusCode?: number, data?: { teams?: unknown[] } }) => {
    assert.equal(error.statusCode, 409)
    assert.deepEqual(error.data?.teams, [{ id: teamA, name: 'Owner team' }])
    return true
  })
  const [still] = await db.select().from(user).where(eq(user.id, ownerOfTeam))
  assert.ok(still, 'the account is still there')
})

test('an admin of a team, but not its owner, is not refused by the owner rule', async () => {
  assert.equal(await accountRefusal(handedOver), null)
  // A person who was an owner and was handed the team over: after the hand-over there is nothing to refuse.
  await db.update(member).set({ role: 'admin' }).where(eq(member.userId, ownerOfTeam))
  assert.equal(await accountRefusal(ownerOfTeam), null)
  await db.update(member).set({ role: 'owner' }).where(eq(member.userId, ownerOfTeam))
})

test('the last instance admin is refused; with another admin it is allowed', async () => {
  const refusal = await accountRefusal(soleAdmin)
  assert.match(refusal?.message ?? '', /instance admin/)
  // Another admin appears: the rule no longer applies.
  const other = id('other-admin')
  await db.insert(user).values({ id: other, name: 'Other admin', email: `${other}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at, isInstanceAdmin: true })
  try {
    assert.equal(await accountRefusal(soleAdmin), null)
  } finally {
    await db.delete(user).where(eq(user.id, other))
  }
})

test('a crew account is refused: it goes with its crew', async () => {
  const refusal = await accountRefusal(crewAccount)
  assert.match(refusal?.message ?? '', /crew account/)
})
