// Crew mail is the correspondence of a crew account: every row where the person is the sender or the recipient goes with
// the account (card mwjfpokj5rvl92bserd, Boss's decision). A person's key is the local part of a crew account's address
// after its crew's slug. A crew account cannot delete itself through the button (it is refused), so this rule runs when
// the crew account goes with its crew. Needs the test database. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_wren node --import tsx --test --test-force-exit tests/account-deletion-crew-mail.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { ACCOUNT_RULES } = await import('../server/utils/accountRules')
const { deleteCrewMailFor } = await import('../server/utils/accountDeletion')
const { organization, crews, crewMail } = schema

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `cm-${tag}-${name}`
const now = Date.now()
const slug = `cm${tag}`
const team = id('team')
const crew = id('crew')
const leftKey = 'wren'
const rightKey = 'pia'
const bystanderKey = 'wick'
const mailIds = [id('m1'), id('m2'), id('m3')]

before(async () => {
  await db.insert(organization).values({ id: team, name: 'Crew mail team', slug: team, createdAt: new Date() })
  await db.insert(crews).values({ id: crew, slug, name: 'Crew mail crew', teamId: team, createdAt: now })
  await db.insert(crewMail).values([
    { id: mailIds[0]!, crewId: crew, fromKey: leftKey, toKey: rightKey, text: 'from wren', created: now },
    { id: mailIds[1]!, crewId: crew, fromKey: rightKey, toKey: leftKey, text: 'to wren', created: now },
    { id: mailIds[2]!, crewId: crew, fromKey: bystanderKey, toKey: rightKey, text: 'between others', created: now }
  ])
})

after(async () => {
  await db.delete(crewMail).where(inArray(crewMail.id, mailIds))
  await db.delete(crews).where(eq(crews.id, crew))
  await db.delete(organization).where(eq(organization.id, team))
  await db.$client.end()
})

test('the crew mail rule is in the rule table, by key (not by user id)', () => {
  assert.equal(ACCOUNT_RULES['crew_mail.from_key'], 'delete-by-key')
  assert.equal(ACCOUNT_RULES['crew_mail.to_key'], 'delete-by-key')
})

test('every row where the person is sender or recipient goes; the others stay', async () => {
  const removed = await deleteCrewMailFor(db, crew, [leftKey])
  assert.equal(removed, 2)
  const left = await db.select({ id: crewMail.id }).from(crewMail).where(inArray(crewMail.id, mailIds))
  assert.deepEqual(left.map(row => row.id), [mailIds[2]])
})

test('no key, no rows: a person with no crew account deletes no crew mail', async () => {
  assert.equal(await deleteCrewMailFor(db, crew, []), 0)
})
