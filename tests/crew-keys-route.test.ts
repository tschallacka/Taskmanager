/* eslint-disable @typescript-eslint/no-explicit-any -- the replies are read loosely: each test checks the fields it names */
// The crew keys route (POST /api/crews/:slug/keys) and the answers around it: no create answer carries a key or a password, a
// (the keys route gives env lines by default and the JSON shape with ?format=json, the old keys stop working after a call,
// and a management token reaches only the crew bound to its own board). Needs the dev database with the crew tables pushed.
// Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5432/arnotes_test node --import tsx --test tests/crew-keys-route.test.ts
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
const { agentAudit, apiKeys, crewBoards, crews, member, organization, projects, user } = await import('../server/db/schema')
const { authenticateApiKey } = await import('../server/utils/api-keys')
const { attachCrew } = await import('../server/utils/crewBoards')
const { CREW_PEOPLE, answerWithoutSecrets, createOrRotateCrew, crewKeysEnv, purgeCrew, requireCrewManager, rotateCrew } = await import('../server/utils/crewProvisioning')
const { issueManagementToken, requireCrewOnOwnBoard } = await import('../server/utils/managementToken')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `ckk-${tag}-${name}`
const now = Date.now()
const at = new Date()

const root = id('root') // the instance admin
const team = id('team')
const board = id('board')
const slugs = { admin: `ckk${tag}a`, management: `ckk${tag}m`, own: `ckk${tag}o`, other: `ckk${tag}x` }
const adminCaller = { userId: root, keyId: null, keyName: 'admin session' }
const managementCaller = { userId: root, keyId: null, keyName: 'management token', boardId: board, management: true }
const input = (slug: string) => ({ slug, name: 'Keys crew', product: { name: 'Keys product' }, rotate: false })

// The people of a made or rotated crew, read loosely: each test checks the fields it names.
type Answer = { status?: number, body: any }
const peopleOf = (answer: Answer) => (answer.body as { people: Record<string, { apiKey: string, password: string }> }).people

before(async () => {
  await db.insert(user).values({ id: root, name: root, email: `${root}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at, isInstanceAdmin: true })
  await db.insert(organization).values({ id: team, name: 'Keys team', slug: team, createdAt: at })
  await db.insert(member).values({ id: id('m1'), organizationId: team, userId: root, role: 'owner', createdAt: at })
  await db.insert(projects).values({ id: board, userId: root, teamId: team, name: 'Keys board', createdAt: now, updatedAt: now })
})

after(async () => {
  const left = await db.select().from(crews).where(inArray(crews.slug, Object.values(slugs)))
  for (const crew of left) await purgeCrew(crew)
  await db.delete(crewBoards).where(eq(crewBoards.projectId, board))
  await db.delete(apiKeys).where(eq(apiKeys.userId, root))
  await db.delete(agentAudit).where(eq(agentAudit.userId, root))
  await db.delete(projects).where(eq(projects.id, board))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(user).where(eq(user.id, root))
})

test('the create answer has no key or password for the instance admin either: the keys route gives them', async () => {
  const raw = await createOrRotateCrew(input(slugs.admin), adminCaller)
  assert.equal(raw.status, 201)
  const answer = answerWithoutSecrets(raw, slugs.admin)
  assert.equal(answer.status, 201)
  const text = JSON.stringify(answer.body)
  assert.ok(!text.includes('arn_'), 'no API key prefix in the body')
  for (const person of Object.values(peopleOf(raw))) {
    assert.ok(!text.includes(person.apiKey), 'no key of a person in the body')
    assert.ok(!text.includes(person.password), 'no password of a person in the body')
  }
  const body = answer.body as any
  assert.deepEqual(Object.keys(body.people), CREW_PEOPLE.map(p => p.key))
  assert.deepEqual(Object.keys(body.people.wren), ['id', 'name', 'role', 'email', 'tag'])
  assert.match(body.keys_url, new RegExp(`/api/crews/${slugs.admin}/keys$`))
})

test('a create answer by a management token has no secret anywhere in the body, and names keys_url', async () => {
  const raw = await createOrRotateCrew(input(slugs.management), managementCaller)
  const answer = answerWithoutSecrets(raw, slugs.management)
  assert.equal(answer.status, 201)

  // Scan the whole body, not one field: every key and password the create made must be absent.
  const text = JSON.stringify(answer.body)
  assert.ok(!text.includes('arn_'), 'no API key prefix in the body')
  for (const person of Object.values(peopleOf(raw))) {
    assert.ok(!text.includes(person.apiKey), 'no API key of a person in the body')
    assert.ok(!text.includes(person.password), 'no password of a person in the body')
  }

  const body = answer.body as any
  assert.match(body.keys_url, new RegExp(`/api/crews/${slugs.management}/keys$`))
  assert.equal(typeof body.keys_note, 'string')
  assert.deepEqual(Object.keys(body.people.wren), ['id', 'name', 'role', 'email', 'tag'])
  assert.equal(body.people.wren.tag, 'wren')
  assert.equal(body.crew.slug, slugs.management)
})

test('the keys route answers env lines by default: one export per person and secret, and the old keys stop working', async () => {
  const bound = await createOrRotateCrew(input(slugs.own), adminCaller)
  const [crew] = await db.select().from(crews).where(eq(crews.slug, slugs.own))
  await attachCrew({ crew: crew!, projectId: board, teamId: team, userId: root })
  const oldWren = peopleOf(bound).wren!.apiKey

  const rotated = await rotateCrew(crew!)
  const env = crewKeysEnv(rotated)
  const lines = env.trimEnd().split('\n')
  assert.match(lines[0]!, /^# Taskmanager crew ckk\w+o, made \S+\. Secret\. Keep this file 0600\.$/)
  assert.equal(lines.length, 1 + CREW_PEOPLE.length * 2)
  assert.ok(!env.includes('{'), 'no JSON in the env answer')

  const prefix = `TASKMANAGER_CREW_${slugs.own.toUpperCase()}`
  for (const line of lines.slice(1)) {
    assert.match(line, new RegExp(`^export ${prefix}_[A-Z]+_(API_KEY|PASSWORD)=[A-Za-z0-9_-]+$`))
  }
  assert.ok(lines.includes(`export ${prefix}_WREN_API_KEY=${rotated.people.wren!.apiKey}`))
  assert.ok(lines.includes(`export ${prefix}_WREN_PASSWORD=${rotated.people.wren!.password}`))

  presented = oldWren
  await assert.rejects(authenticateApiKey(asToken(oldWren)), 'the old key no longer works')
  await authenticateApiKey(asToken(rotated.people.wren!.apiKey))
})

test('a second call gives new keys, and the ?format=json shape is the create answer\'s shape', async () => {
  const [crew] = await db.select().from(crews).where(eq(crews.slug, slugs.own))
  const first = await rotateCrew(crew!)
  const second = await rotateCrew(crew!)
  assert.notEqual(peopleOf({ body: second }).wren!.apiKey, peopleOf({ body: first }).wren!.apiKey)
  assert.deepEqual(Object.keys(second).sort(), ['base', 'board', 'crew', 'people', 'team'])
  assert.match(peopleOf({ body: second }).wren!.apiKey, /^arn_/)
  assert.ok(JSON.stringify(second).includes(peopleOf({ body: second }).wren!.password))
})

test('a management token reaches only the crew bound to its own board; another crew reads as not found', async () => {
  const other = await createOrRotateCrew(input(slugs.other), adminCaller)
  assert.equal(other.status, 201)
  const [ownCrew] = await db.select().from(crews).where(eq(crews.slug, slugs.own))
  const [otherCrew] = await db.select().from(crews).where(eq(crews.slug, slugs.other))
  await requireCrewOnOwnBoard(managementCaller, ownCrew!)
  await assert.rejects(requireCrewOnOwnBoard(managementCaller, otherCrew!), (e: { statusCode?: number }) => e.statusCode === 404)
})

test('a management token reaches requireCrewManager with its one board', async () => {
  const made = await issueManagementToken(root, board)
  const managed = await requireCrewManager(asToken(made.token))
  assert.equal(managed.boardId, board)
})
