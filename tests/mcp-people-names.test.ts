// A person with no name is shown as "Unnamed person" in the assignee names of task cards, never by email: these are
// plain strings with no email field, so the email privacy rule could not strip the address. Needs the test database:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_<key> node --import tsx --test --test-force-exit tests/mcp-people-names.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { inArray } from 'drizzle-orm'

const { db } = await import('../server/db')
const { user } = await import('../server/db/schema')
const { peopleNames } = await import('../server/utils/mcpBoardTools')

const tag = randomBytes(4).toString('hex')
const nameless = `pn-${tag}-nameless`
const named = `pn-${tag}-named`
const now = new Date()

before(async () => {
  await db.insert(user).values([
    { id: nameless, name: '', email: `${nameless}@example.test`, emailVerified: true, createdAt: now, updatedAt: now },
    { id: named, name: 'Named Person', email: `${named}@example.test`, emailVerified: true, createdAt: now, updatedAt: now }
  ])
})

after(async () => {
  await db.delete(user).where(inArray(user.id, [nameless, named]))
})

// A personal board lists only its owner, so each owner gives one person.
const personalBoard = (userId: string) => ({ id: `pn-${tag}-board`, userId, teamId: null, customerId: null }) as never

test('a person with no name is "Unnamed person", never their email', async () => {
  const names = await peopleNames(personalBoard(nameless))
  assert.equal(names.get(nameless), 'Unnamed person')
  assert.ok(![...names.values()].some(name => name.includes('@')))
})

test('a person with a name is shown by that name', async () => {
  assert.equal((await peopleNames(personalBoard(named))).get(named), 'Named Person')
})
