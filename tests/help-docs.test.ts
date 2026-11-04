// Help follows permissions: a page, and a section of a page, shows only to someone who may do what it
// describes, in the list, in a search, through an agent key and so through Sprocket. Needs the dev
// database and the Nuxt aliases. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/help-docs.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

Object.assign(globalThis, { createError })

// The loader reads Nitro's `assets:docs` storage; the test answers it with a few small pages.
const PAGES: Record<string, string> = {
  'basics:boards.md': '---\ntitle: Boards and columns\nsummary: What a board is\ntopics: board, kanban\n---\nA board holds columns.\n\n<!-- requires: team-admin -->\nAn admin sets the default columns under Board defaults.\n<!-- /requires -->\n\nMove a task by dragging it.',
  'team:rules.md': '---\ntitle: Team rules\nsummary: One rule for every board\nrequires: team-admin\ntopics: rules\n---\nWrite a rule under Rules on the team page.',
  'team:owner-only.md': '---\ntitle: Deleting the team\nrequires: team-owner\n---\nOnly the owner deletes a team.',
  'crews:crews.md': '---\ntitle: Crews\nrequires: crews\n---\nManage crews.',
  'readme.md': 'No front matter here, and not a page.'
}
Object.assign(globalThis, {
  useStorage: () => ({
    getKeys: async () => Object.keys(PAGES),
    getItem: async (key: string) => PAGES[key] ?? null
  })
})

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { apiKeys, customerMembers, customers, member, organization, user } = schema
const { parseHelpDoc, bodyFor, viewableDocs, searchHelp, IMPLIED_PERMISSIONS } = await import('../shared/utils/helpDocs')
const { helpPermissionsOf } = await import('../server/utils/helpAccess')
const { viewerDoc, viewerDocs, searchViewerHelp } = await import('../server/utils/helpStore')
const { MCP_TOOLS } = await import('../server/utils/mcpRegistry')
const { issueKey } = await import('../server/utils/keyIssue')
const { agentChatResponse } = await import('../server/utils/sprocketAgent')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `thp-${tag}-${name}`
const owner = id('owner')
const admin = id('admin')
const staff = id('staff')
const contact = id('contact')
const root = id('root')
const team = id('team')
const customer = id('customer')
const now = Date.now()
const users = [owner, admin, staff, contact, root]

before(async () => {
  const at = new Date()
  await db.insert(user).values(users.map(u => ({ id: u, name: u, email: `${u}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at, isInstanceAdmin: u === root })))
  await db.insert(organization).values({ id: team, name: 'Help team', slug: team, createdAt: at })
  await db.insert(member).values([
    { id: id('m1'), organizationId: team, userId: owner, role: 'owner', createdAt: at },
    { id: id('m2'), organizationId: team, userId: admin, role: 'admin', createdAt: at },
    { id: id('m3'), organizationId: team, userId: staff, role: 'member', createdAt: at },
    { id: id('m4'), organizationId: team, userId: root, role: 'member', createdAt: at }
  ])
  await db.insert(customers).values({ id: customer, organizationId: team, name: 'Acme', createdAt: now, updatedAt: now })
  await db.insert(customerMembers).values({ id: id('cm'), customerId: customer, userId: contact, createdAt: now })
})

after(async () => {
  await db.delete(apiKeys).where(inArray(apiKeys.userId, users))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(user).where(inArray(user.id, users))
  await db.$client.end()
})

const titles = async (userId: string, teamId: string | null, scopes?: ('boards:read' | 'boards:write' | 'secrets:read' | 'secrets:write' | 'crews:manage')[]) =>
  (await viewerDocs({ userId, teamId, scopes })).map(doc => doc.title).sort()

test('a page without front matter or with an unknown permission refuses to load, naming the file', () => {
  assert.throws(() => parseHelpDoc('a/b', 'just text'), /docs\/a\/b\.md has no front matter/)
  assert.throws(() => parseHelpDoc('a/b', '---\nsummary: x\n---\nbody'), /has no title/)
  assert.throws(() => parseHelpDoc('a/b', '---\ntitle: T\nrequires: wizard\n---\nbody'), /"wizard", which is not a permission/)
  assert.throws(() => parseHelpDoc('a/b', '---\ntitle: T\n---\n<!-- requires: nope -->\nx\n<!-- /requires -->'), /line 1: "nope" is not a permission/)
  assert.throws(() => parseHelpDoc('a/b', '---\ntitle: T\n---\n<!-- requires: staff -->\nx'), /leaves a <!-- requires --> section open/)
  assert.throws(() => parseHelpDoc('a/b', '---\ntitle: T\n---\nx\n<!-- /requires -->'), /closes nothing/)
})

test('a section is cut out for a reader who lacks what it needs, markers included', () => {
  const body = 'one\n<!-- requires: team-admin -->\nsecret\n<!-- requires: write -->\ninner\n<!-- /requires -->\n<!-- /requires -->\ntwo'
  assert.equal(bodyFor(body, new Set(['staff'])), 'one\ntwo')
  assert.equal(bodyFor(body, new Set(['team-admin'])), 'one\nsecret\ntwo')
  assert.equal(bodyFor(body, new Set(['team-admin', 'write'])), 'one\nsecret\ninner\ntwo')
  // Inside a closed section, an open inner section must not bring text back.
  assert.equal(bodyFor(body, new Set(['write'])), 'one\ntwo')
})

test('a search never returns a page, or text, the reader may not see', () => {
  const docs = [
    parseHelpDoc('team/rules', PAGES['team:rules.md']!),
    parseHelpDoc('basics/boards', PAGES['basics:boards.md']!)
  ]
  const staffViews = viewableDocs(docs, new Set(['staff']))
  assert.deepEqual(staffViews.map(view => view.slug), ['basics/boards'])
  assert.deepEqual(searchHelp(staffViews, 'rules').map(hit => hit.slug), [])
  assert.ok(!searchHelp(staffViews, 'default columns').some(hit => hit.snippet?.includes('admin sets')))
  const adminViews = viewableDocs(docs, new Set(['staff', 'team-admin']))
  assert.equal(searchHelp(adminViews, 'rules')[0]!.slug, 'team/rules')
  assert.ok(searchHelp(adminViews, 'default columns')[0]!.snippet?.includes('admin sets'))
})

test('permissions follow the role in the workspace, the customer link, the instance admin flag and the key', async () => {
  const perms = async (userId: string, teamId: string | null, scopes?: ('boards:read' | 'boards:write' | 'secrets:read' | 'crews:manage')[]) =>
    [...await helpPermissionsOf({ userId, teamId, scopes })].sort()
  assert.deepEqual(await perms(owner, team), ['secrets', 'staff', 'team-admin', 'team-owner', 'write'])
  assert.deepEqual(await perms(admin, team), ['secrets', 'staff', 'team-admin', 'write'])
  assert.deepEqual(await perms(staff, team), ['secrets', 'staff', 'write'])
  assert.deepEqual(await perms(contact, null), ['customer', 'write'])
  // A read-only key writes nothing, and a key without the secrets permissions reads no secrets.
  assert.deepEqual(await perms(admin, team, ['boards:read']), ['staff', 'team-admin'])
  // The crews permission needs the instance admin as well as the key.
  assert.ok(!(await perms(admin, team, ['boards:read', 'crews:manage'])).includes('crews'))
  assert.ok((await perms(root, team, ['boards:read', 'crews:manage'])).includes('crews'))
  assert.ok(!(await perms(root, team, ['boards:read'])).includes('crews'))
})

test('what a permission implies is always held with it, so pages may rely on it', async () => {
  const everyone: [string, string | null, ('boards:read' | 'boards:write' | 'crews:manage')[] | undefined][] = [
    [owner, team, undefined], [admin, team, undefined], [staff, team, undefined], [contact, null, undefined],
    [root, team, ['boards:read', 'crews:manage']], [admin, team, ['boards:read']]
  ]
  for (const [userId, teamId, scopes] of everyone) {
    const held = await helpPermissionsOf({ userId, teamId, scopes })
    for (const permission of held) {
      for (const implied of IMPLIED_PERMISSIONS[permission] ?? []) {
        assert.ok(held.has(implied), `${userId} holds ${permission} without ${implied}`)
      }
    }
  }
})

test('each reader sees only the pages for what they may do', async () => {
  assert.deepEqual(await titles(contact, null), ['Boards and columns'])
  assert.deepEqual(await titles(staff, team), ['Boards and columns'])
  assert.deepEqual(await titles(admin, team), ['Boards and columns', 'Team rules'])
  assert.deepEqual(await titles(owner, team), ['Boards and columns', 'Deleting the team', 'Team rules'])
  assert.deepEqual(await titles(root, team, ['boards:read', 'crews:manage']), ['Boards and columns', 'Crews'])
})

test('a page the reader may not open is not found, and its text is not in a search', async () => {
  assert.equal(await viewerDoc({ userId: staff, teamId: team }, 'team/rules'), null)
  assert.equal(await viewerDoc({ userId: contact, teamId: null }, 'team/owner-only'), null)
  assert.equal((await viewerDoc({ userId: admin, teamId: team }, 'team/rules'))?.title, 'Team rules')
  assert.deepEqual(await searchViewerHelp({ userId: staff, teamId: team }, 'rule'), [])
  const staffBoards = await viewerDoc({ userId: staff, teamId: team }, 'basics/boards')
  assert.ok(!staffBoards!.body.includes('Board defaults') && staffBoards!.body.includes('dragging'))
  assert.ok((await viewerDoc({ userId: admin, teamId: team }, 'basics/boards'))!.body.includes('Board defaults'))
})

test('the agent help tools answer with the key\'s permissions, so Sprocket never reads past its person', async () => {
  const search = MCP_TOOLS.find(t => t.name === 'search_help')!
  const read = MCP_TOOLS.find(t => t.name === 'read_help')!
  assert.ok(search.readOnly && read.readOnly)
  const context = (userId: string, scopes: ('boards:read' | 'boards:write')[]) =>
    ({ keyId: 'k', keyName: 'k', userId, teamId: team, customerId: null, projectId: null, scopes })

  const asStaff = context(staff, ['boards:read'])
  assert.deepEqual(((await search.handler({ query: 'rule' }, asStaff)) as { pages: unknown[] }).pages, [])
  await assert.rejects(() => read.handler({ slug: 'team/rules' }, asStaff), /no help page "team\/rules" for you/)

  const asAdmin = context(admin, ['boards:read', 'boards:write'])
  assert.equal(((await search.handler({ query: 'rule' }, asAdmin)) as { pages: { slug: string }[] }).pages[0]!.slug, 'team/rules')
  const page = await read.handler({ slug: 'team/rules' }, asAdmin) as { markdown: string }
  assert.ok(page.markdown.includes('Write a rule'))
})

test('Sprocket can only be run as a key of the person who asks', async () => {
  const savedFlag = process.env.SPROCKET_CLAUDE_FOR_ALL
  const savedBin = process.env.SPROCKET_CLAUDE_BIN
  process.env.SPROCKET_CLAUDE_FOR_ALL = 'true'
  process.env.SPROCKET_CLAUDE_BIN = process.execPath
  try {
    await issueKey({ userId: admin, teamId: team, request: { name: 'admin agent', scopes: ['boards:read', 'boards:write'], expiresAt: null }, limit: { customerId: null, projectId: null } })
    const [adminKey] = await db.select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.userId, admin))
    // Someone else picks the admin's key as Sprocket's agent: refused before anything runs.
    await assert.rejects(
      () => agentChatResponse({ userId: staff, settings: { agentKeyId: adminKey!.id, model: 'haiku', effort: null }, history: [{ role: 'user', content: 'hi' }], today: '2026-11-04', thinking: false }),
      (error: { statusCode?: number }) => error.statusCode === 400
    )
  } finally {
    if (savedFlag === undefined) delete process.env.SPROCKET_CLAUDE_FOR_ALL
    else process.env.SPROCKET_CLAUDE_FOR_ALL = savedFlag
    if (savedBin === undefined) delete process.env.SPROCKET_CLAUDE_BIN
    else process.env.SPROCKET_CLAUDE_BIN = savedBin
  }
})
