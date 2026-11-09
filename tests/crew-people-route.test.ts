/* eslint-disable @typescript-eslint/no-explicit-any -- the replies are read loosely: each test checks the fields it names */
// The crew people route (POST /api/crews/:slug/people) and the cast in the crew status: a crew made before a role existed
// gets the missing people, with their keys, and nobody who exists is rotated. A second call adds nobody. An unknown key is
// refused by name. Needs the test database with the crew tables pushed.
// Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test node --import tsx --test --test-force-exit tests/crew-people-route.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

Object.assign(globalThis, { createError })
let presented = ''
Object.assign(globalThis, { getRequestHeader: (_e: unknown, name: string) => (name === 'authorization' ? `Bearer ${presented}` : undefined) })
const asToken = (token: string) => {
  presented = token
  return {} as never
}

const { db } = await import('../server/db')
const { apiKeys, crewBoards, crews, customerMembers, member, organization, projects, user } = await import('../server/db/schema')
const { authenticateApiKey } = await import('../server/utils/api-keys')
const { crewAddress } = await import('../server/utils/crewAccounts')
const { CREW_PEOPLE, addCrewPeople, createOrRotateCrew, crewView, parsePeopleKeys, purgeCrew } = await import('../server/utils/crewProvisioning')

const tag = randomBytes(4).toString('hex')
const now = Date.now()
const at = new Date()

const root = `ckp-${tag}-root` // the instance admin
const adminCaller = { userId: root, keyId: null, keyName: 'admin session' }
// One crew per test, each with its own slug, so the tests never share a crew.
const slugs: string[] = []
let next = 0

// The keys of a people answer, read loosely.
type Answer = { status?: number, body: any }
const peopleOf = (answer: Answer) => (answer.body as { people: Record<string, { apiKey: string, password: string, id: string }> }).people

// Makes a crew as it was before the newest roles: the accounts of the removed people go, with their keys and seats.
async function makeOldCrew(removed: string[]) {
  const slug = `ckp${tag}${next++}`
  slugs.push(slug)
  const made = await createOrRotateCrew({ slug, name: 'People crew', product: { name: 'People product' }, rotate: false }, adminCaller)
  assert.equal(made.status, 201)
  const [crew] = await db.select().from(crews).where(eq(crews.slug, slug))
  await db.delete(user).where(inArray(user.email, removed.map(key => crewAddress(slug, key))))
  return { slug, crew: crew!, made }
}

before(async () => {
  const team = `ckp-${tag}-team`
  await db.insert(user).values({ id: root, name: root, email: `${root}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at, isInstanceAdmin: true })
  await db.insert(organization).values({ id: `ckp-${tag}-own`, name: 'People team', slug: team, createdAt: at })
  await db.insert(member).values({ id: `ckp-${tag}-m1`, organizationId: `ckp-${tag}-own`, userId: root, role: 'owner', createdAt: at })
  await db.insert(projects).values({ id: `ckp-${tag}-board`, userId: root, teamId: `ckp-${tag}-own`, name: 'People board', createdAt: now, updatedAt: now })
})

after(async () => {
  const left = await db.select().from(crews).where(inArray(crews.slug, slugs))
  for (const crew of left) await purgeCrew(crew)
  await db.delete(crewBoards).where(eq(crewBoards.projectId, `ckp-${tag}-board`))
  await db.delete(apiKeys).where(eq(apiKeys.userId, root))
  await db.delete(projects).where(eq(projects.id, `ckp-${tag}-board`))
  await db.delete(organization).where(eq(organization.id, `ckp-${tag}-own`))
  await db.delete(user).where(eq(user.id, root))
})

test('the cast lists every person of the kit, present or missing', async () => {
  const { crew } = await makeOldCrew(['susy', 'janet', 'pat', 'tess'])
  const view = await crewView(crew)
  assert.deepEqual(view.cast.map(c => c.key), CREW_PEOPLE.map(p => p.key))
  const status = Object.fromEntries(view.cast.map(c => [c.key, c.status]))
  assert.equal(status.wren, 'present')
  assert.equal(status.susy, 'missing')
  assert.equal(status.janet, 'missing')
  assert.equal(view.cast.find(c => c.key === 'susy')!.name, 'Susy Secretary')
})

test('adding the missing people gives keys for the new people only, and existing keys keep working', async () => {
  const { crew, made } = await makeOldCrew(['susy', 'janet', 'pat', 'tess'])
  const wrenKey = peopleOf(made).wren!.apiKey
  const [fresh] = await db.select().from(crews).where(eq(crews.id, crew.id))
  const added = await addCrewPeople(fresh!, null)
  assert.deepEqual(added.added, ['susy', 'janet', 'pat', 'tess'])
  assert.deepEqual(Object.keys(added.body as any).sort(), ['base', 'board', 'crew', 'people', 'team'])
  const people = peopleOf(added)
  assert.deepEqual(Object.keys(people).sort(), ['janet', 'pat', 'susy', 'tess'])
  for (const person of Object.values(people)) {
    assert.match(person.apiKey, /^arn_/)
    assert.ok(person.password.length > 0)
  }
  // A person added this way is a team member, as one made at creation is.
  const [susyAccount] = await db.select({ id: user.id }).from(user).where(eq(user.email, crewAddress(crew.slug, 'susy')))
  const [seat] = await db.select({ role: member.role }).from(member).where(eq(member.userId, susyAccount!.id))
  assert.equal(seat?.role, 'member')
  // Nobody who was there is rotated: the worker's key from the create still works.
  await authenticateApiKey(asToken(wrenKey))
})

test('a second call adds nobody and answers an empty people map', async () => {
  const { crew } = await makeOldCrew(['pat'])
  const [fresh] = await db.select().from(crews).where(eq(crews.id, crew.id))
  await addCrewPeople(fresh!, null)
  const second = await addCrewPeople(fresh!, null)
  assert.deepEqual(second.added, [])
  assert.deepEqual((second.body as any).people, {})
})

test('a named list adds only the people named; a contact joins its customer; a person already there is skipped', async () => {
  const { crew } = await makeOldCrew(['tess', 'contact'])
  const [fresh] = await db.select().from(crews).where(eq(crews.id, crew.id))
  const named = await addCrewPeople(fresh!, ['tess', 'contact', 'wren'])
  assert.deepEqual([...named.added].sort(), ['contact', 'tess'])
  assert.deepEqual(Object.keys(peopleOf(named)).sort(), ['contact', 'tess'])
  const [contactAccount] = await db.select({ id: user.id }).from(user).where(eq(user.email, crewAddress(crew.slug, 'contact')))
  const joined = await db.select({ id: customerMembers.id }).from(customerMembers).where(eq(customerMembers.userId, contactAccount!.id))
  assert.equal(joined.length, 1, 'the contact is a member of the customer')
  // A contact's key has no team, as a contact made at creation has none.
  await authenticateApiKey(asToken(peopleOf(named).contact!.apiKey))
})

test('an unknown key is refused by name, and nothing named means everyone', () => {
  assert.throws(() => parsePeopleKeys(null, 'susy,nobody'), (e: { statusCode?: number, message?: string }) => e.statusCode === 400 && /nobody/.test(e.message ?? ''))
  assert.throws(() => parsePeopleKeys({ people: ['wren', 7] }, undefined), (e: { statusCode?: number }) => e.statusCode === 400)
  assert.equal(parsePeopleKeys(null, undefined), null, 'nothing named means everyone the kit has')
  assert.deepEqual(parsePeopleKeys({ people: ['susy'] }, 'janet'), ['susy', 'janet'])
  assert.deepEqual(parsePeopleKeys({ people: [] }, undefined), [], 'an empty list names nobody, so it adds nobody')
})
