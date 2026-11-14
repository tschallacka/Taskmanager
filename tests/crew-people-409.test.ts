// addPeopleTo answers 409 only for the real address clash (card mw9kb2n63gj2of29fin). A database error while the person is
// made is not an address clash: it keeps its own failure. Needs the test database, nothing skipped. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_wade node --import tsx --test tests/crew-people-409.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { eq, inArray, like } from 'drizzle-orm'
import { db } from '../server/db'
import { crews, organization, user } from '../server/db/schema'
import { addCrewPeople } from '../server/utils/crewProvisioning'
import { crewAddress } from '../server/utils/crewAccounts'
import { genId } from '../server/utils/projects'

const tag = randomBytes(4).toString('hex')
const slug = `p409-${tag}`
const orgId = genId()
const crewId = genId()
const crewRow = { id: crewId, slug, name: `people 409 ${tag}`, teamId: orgId, createdAt: Date.now() }

before(async () => {
  await db.insert(organization).values({ id: orgId, name: `people 409 ${tag}`, slug: `p409-org-${tag}`, createdAt: new Date() })
  await db.insert(crews).values(crewRow)
})

after(async () => {
  await db.delete(user).where(like(user.email, `%-${tag}@%`))
  await db.delete(user).where(eq(user.email, crewAddress(slug, 'susy')))
  await db.delete(crews).where(inArray(crews.id, [crewId]))
  await db.delete(organization).where(eq(organization.id, orgId))
  await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end()
})

test('a real address clash answers 409 with the sentence the card names', async () => {
  // Another account holds the address the crew needs for janet, and it is not this crew's account.
  await db.insert(user).values({
    id: genId(),
    name: 'Someone else',
    email: crewAddress(slug, 'janet'),
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    crewId: null
  })
  await assert.rejects(addCrewPeople(crewRow as never, ['janet']), (error: { statusCode?: number, message?: string }) => {
    assert.equal(error.statusCode, 409)
    assert.equal(error.message, 'An address this crew needs belongs to another account.')
    return true
  })
})

test('a database error while making a person is not reported as an address clash', async () => {
  // A team that does not exist: the account is made, then its team seat fails on the foreign key. That is a database
  // error, and it must keep its own failure, not the 409 of an address that another account holds.
  const broken = { ...crewRow, teamId: `no-such-team-${tag}` }
  await assert.rejects(addCrewPeople(broken as never, ['susy']), (error: { statusCode?: number }) => {
    assert.notEqual(error.statusCode, 409, 'a database failure must not be answered as an address clash')
    return true
  })
})
