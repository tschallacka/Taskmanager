/* eslint-disable @typescript-eslint/no-explicit-any -- the backup is read loosely: each test checks the fields it names */
// Who sees what in a board backup. A board admin's staff file holds names, addresses, time logs, rules and the
// identity behind changes. A team member's file and a customer's file hold none of those: people are a key and
// a mention tag, and every name or address in the text is replaced by the tag. Needs the dev database. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json node --import tsx --test tests/board-backup-privacy.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const backup = await import('../server/utils/boardBackup')
const { validateBoardBackup } = await import('../shared/backup/schema')
const {
  user, organization, member, projects, projectColumns, projectTasks, taskComments, timeEntries, projectRules, taskActivity, crews,
  projectGuests
} = schema

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `bp-${tag}-${name}`
const at = 1_700_000_000_000

const people = {
  admin: { id: id('admin'), name: 'Alder Brightwater', email: `alder.${tag}@example.test` },
  member: { id: id('member'), name: 'Zelda Quorvex', email: `zelda.${tag}@example.test` },
  customer: { id: id('customer'), name: 'Mira Vantablack', email: `mira.${tag}@example.test` },
  crew: { id: id('crew-user'), name: 'Crewbot Nine', email: `crewbot.${tag}@example.test` }
}
const team = id('team')
const crewId = id('crew')
const project = id('project')
const column = id('column')
const internalTask = id('t-internal')
const customerTask = id('t-customer')

// Every value that must not appear outside an admin's file: full names, first names and addresses.
const secrets = [
  'Alder Brightwater', 'Zelda Quorvex', 'Mira Vantablack', 'Crewbot Nine',
  'Alder', 'Zelda', 'Mira', 'Crewbot',
  people.admin.email, people.member.email, people.customer.email, people.crew.email
]

let adminFile: any
let memberFile: any
let customerFile: any
let memberText: string
let customerText: string
let adminText: string

async function read(request: { viewerId: string, callerId: string, audience: 'staff' | 'customer', admin: boolean }) {
  const row = (await db.select().from(projects).where(eq(projects.id, project)))[0]!
  const plan = await backup.prepareBackup({
    project: row, keyId: null, keyName: 'test', only: null, columns: null, inlineAttachments: false, instance: 'test.local', ...request
  })
  return new Response(backup.streamBoardBackup(plan)).text()
}

before(async () => {
  await db.insert(organization).values({ id: team, name: 'Privacy team', slug: team, createdAt: new Date(at) })
  for (const p of Object.values(people)) {
    await db.insert(user).values({ id: p.id, name: p.name, email: p.email, emailVerified: true, createdAt: new Date(at), updatedAt: new Date(at) })
  }
  await db.insert(crews).values({ id: crewId, slug: id('crew-slug'), name: 'Privacy crew', teamId: team, createdAt: at })
  await db.update(user).set({ crewId }).where(eq(user.id, people.crew.id))
  await db.insert(member).values([
    { id: id('m-admin'), organizationId: team, userId: people.admin.id, role: 'owner', createdAt: new Date(at) },
    { id: id('m-member'), organizationId: team, userId: people.member.id, role: 'member', createdAt: new Date(at) }
  ])
  await db.insert(projects).values({ id: project, userId: people.admin.id, teamId: team, name: `Privacy board ${tag}`, description: 'board', createdAt: at, updatedAt: at })
  await db.insert(projectColumns).values({ id: column, projectId: project, name: 'To do', position: 0, createdAt: at })
  // The customer is a guest of the board: a mention of her by name is still a name the file must not show.
  await db.insert(projectGuests).values({ id: id('guest'), projectId: project, userId: people.customer.id, role: 'editor', addedBy: people.admin.id, createdAt: at })
  await db.insert(projectTasks).values([
    {
      id: internalTask, projectId: project, columnId: column, title: 'Internal work', description: `<p>Ask @${people.member.name} about it</p>`,
      tags: [], visibility: 'internal', assigneeId: people.member.id, createdBy: people.admin.id, position: 0, createdAt: at, updatedAt: at
    },
    {
      id: customerTask, projectId: project, columnId: column, title: 'Customer work', description: `<p>Write to ${people.member.email}, or @${people.customer.name}</p>`,
      tags: [], visibility: 'customer', assigneeId: people.crew.id, createdBy: people.crew.id, position: 1, createdAt: at + 1, updatedAt: at + 1
    }
  ])
  await db.insert(taskComments).values([
    { id: id('c-internal'), taskId: internalTask, userId: people.member.id, body: 'internal note', visibility: 'internal', createdVia: 'ui', createdAt: at + 2 },
    { id: id('c-customer'), taskId: customerTask, userId: people.crew.id, body: `shipped for ${people.customer.name}`, visibility: 'customer', createdVia: 'mcp', createdAt: at + 3 }
  ])
  await db.insert(taskActivity).values({ id: id('act'), taskId: customerTask, projectId: project, actorId: people.crew.id, via: 'mcp', kind: 'created', detail: { title: 'Customer work' }, createdAt: at + 1 })
  await db.insert(timeEntries).values({ id: id('time'), taskId: internalTask, projectId: project, userId: people.member.id, minutes: 30, day: '2026-11-08', note: '', createdAt: at + 4 })
  await db.insert(projectRules).values({ id: id('rule'), projectId: project, name: 'Ship rule', enabled: true, trigger: { kind: 'moved' }, conditions: [], actions: [], position: 0, createdBy: people.admin.id, createdAt: at, updatedAt: at })

  adminText = await read({ viewerId: people.admin.id, callerId: people.admin.id, audience: 'staff', admin: true })
  memberText = await read({ viewerId: people.member.id, callerId: people.member.id, audience: 'staff', admin: false })
  customerText = await read({ viewerId: people.customer.id, callerId: people.customer.id, audience: 'customer', admin: false })
  adminFile = JSON.parse(adminText)
  memberFile = JSON.parse(memberText)
  customerFile = JSON.parse(customerText)
})

after(async () => {
  await db.delete(projects).where(eq(projects.id, project))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(crews).where(eq(crews.id, crewId))
  await db.delete(user).where(inArray(user.id, Object.values(people).map(p => p.id)))
})

test('an admin file holds names, addresses, time logs, rules and the flag that says so', () => {
  assert.equal(validateBoardBackup(adminFile).ok, true)
  assert.equal(adminFile.includesSensitive, true)
  assert.equal(adminFile.audience, 'staff')
  assert.equal(adminFile.counts.timeEntries, 1)
  assert.equal(adminFile.counts.rules, 1)
  const admin = adminFile.people.find((p: any) => p.name === people.admin.name)
  assert.equal(admin.email, people.admin.email)
  assert.equal(admin.kind, 'person')
  assert.ok(adminText.includes(people.member.name), 'the admin file names the team member')
})

test('a team member file has no name, address, time log, rule or sensitive flag', () => {
  assert.equal(validateBoardBackup(memberFile).ok, true)
  assert.equal(memberFile.includesSensitive, false)
  assert.equal(memberFile.audience, 'staff')
  assert.equal(memberFile.counts.timeEntries, 0)
  assert.equal(memberFile.counts.rules, 0)
  assert.deepEqual(memberFile.timeEntries, [])
  assert.deepEqual(memberFile.rules, [])
})

test('a customer file has no name, address, time log, rule or sensitive flag, and only customer cards', () => {
  assert.equal(validateBoardBackup(customerFile).ok, true)
  assert.equal(customerFile.includesSensitive, false)
  assert.equal(customerFile.audience, 'customer')
  assert.equal(customerFile.counts.timeEntries, 0)
  assert.equal(customerFile.counts.rules, 0)
  assert.deepEqual(customerFile.tasks.map((task: any) => task.id), [customerTask])
})

test('outside an admin file a person is only a key and a mention tag', () => {
  for (const file of [memberFile, customerFile]) {
    assert.ok(file.people.length > 0)
    for (const person of file.people) {
      assert.deepEqual(Object.keys(person).sort(), ['key', 'tag'])
      assert.match(person.tag, /^@person-\d+$/)
    }
  }
})

test('a non-admin file contains no display name and no address of any person', () => {
  for (const value of secrets) {
    assert.ok(!memberText.includes(value), `the team member file holds "${value}"`)
    assert.ok(!customerText.includes(value), `the customer file holds "${value}"`)
  }
})

test('a mention of a person becomes that person tag outside an admin file', () => {
  const description = memberFile.tasks.find((task: any) => task.id === internalTask).description
  const tag = memberFile.people.find((p: any) => p.key === memberFile.tasks.find((task: any) => task.id === internalTask).assignee).tag
  assert.ok(description.includes(tag), `expected ${tag} in "${description}"`)
  assert.ok(!description.includes('Quorvex'))
})

test('the change behind an MCP action reads as agent outside an admin file', () => {
  const activity = memberFile.activity.find((row: any) => row.taskId === customerTask)
  assert.equal(activity.via, 'agent')
  const update = memberFile.updates.find((row: any) => row.taskId === customerTask)
  assert.equal(update.createdVia, 'agent')
  const adminActivity = adminFile.activity.find((row: any) => row.taskId === customerTask)
  assert.equal(adminActivity.via, 'mcp')
})

test('the admin file names the same person the team member file tags', () => {
  const adminMember = adminFile.people.find((p: any) => p.name === people.member.name)
  const memberTag = memberFile.people.find((p: any) => p.key === adminMember.key)
  assert.ok(memberTag, 'the team member file has the same key')
  assert.ok(!('name' in memberTag))
})
