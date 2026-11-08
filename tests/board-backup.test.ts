/* eslint-disable @typescript-eslint/no-explicit-any -- the backup is read loosely: each test checks the fields it names */
// The board backup export on a real board: every section, the timestamps to the millisecond, the checksum,
// the split by `only` and `columns`, the attachments, the one-at-a-time slot, and what never leaves the
// database. Needs the dev database and the Nuxt aliases. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/board-backup.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { eq, inArray } from 'drizzle-orm'

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const backup = await import('../server/utils/boardBackup')
const attachmentsUtil = await import('../server/utils/attachments')
const { validateBoardBackup } = await import('../shared/backup/schema')
const {
  user, organization, member, projects, projectColumns, projectTasks, projectFields, taskFieldValues, taskDependencies,
  taskActivity, taskComments, timeEntries, projectStatusUpdates, projectMessages, githubLinks, projectRules, projectSecrets
} = schema

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `bb-${tag}-${name}`
const SECRET_MARKER = `secret-marker-${tag}`
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
const at = 1_700_000_000_123
const staffUser = id('staff')
const team = id('team')
const project = id('project')
const cols = { todo: id('col-todo'), done: id('col-done') }
const tasks = { parent: id('t-parent'), sub: id('t-sub'), trashed: id('t-trashed') }
const fieldId = id('field')
const pngName = `${tag}x.png`

let parsed: any
let plan: Awaited<ReturnType<typeof backup.prepareBackup>>

async function collect(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text()
}

before(async () => {
  await db.insert(user).values({ id: staffUser, name: 'Staff Person', email: `${staffUser}@arnotes.test`, emailVerified: true, createdAt: new Date(at), updatedAt: new Date(at) })
  await db.insert(organization).values({ id: team, name: 'Backup team', slug: team, createdAt: new Date(at) })
  await db.insert(member).values({ id: id('m'), organizationId: team, userId: staffUser, role: 'owner', createdAt: new Date(at) })
  await db.insert(projects).values({ id: project, userId: staffUser, teamId: team, name: `Backup board ${tag}`, description: 'the board', status: 'on_track', labelColors: { bug: '#f00' }, createdAt: at, updatedAt: at + 5 })
  await db.insert(projectColumns).values([
    { id: cols.todo, projectId: project, name: 'To do', position: 0, createdAt: at },
    { id: cols.done, projectId: project, name: 'Done', position: 1, createdAt: at }
  ])
  await db.insert(projectTasks).values([
    { id: tasks.parent, projectId: project, columnId: cols.todo, title: 'Parent card', description: '<p>parent</p>', tags: ['crew'], visibility: 'customer', assigneeId: staffUser, createdBy: staffUser, dueOn: '2026-12-01', position: 0, createdAt: at + 1, updatedAt: at + 2 },
    { id: tasks.sub, projectId: project, columnId: cols.todo, parentTaskId: tasks.parent, title: 'Subtask', description: '', tags: [], visibility: 'internal', position: 1, createdAt: at + 3, updatedAt: at + 4 },
    { id: tasks.trashed, projectId: project, columnId: cols.done, title: 'Gone', description: '', tags: [], visibility: 'internal', position: 2, createdAt: at + 6, updatedAt: at + 7, deletedAt: at + 8, deletedBy: staffUser, deletedVia: 'mcp' }
  ])
  await db.insert(projectFields).values({ id: fieldId, projectId: project, name: 'Priority', type: 'select', options: [{ id: 'o1', label: 'High', color: 'red' }], position: 0, createdAt: at })
  await db.insert(taskFieldValues).values({ taskId: tasks.parent, fieldId, value: 'o1' })
  await db.insert(taskDependencies).values({ id: id('dep'), blockedTaskId: tasks.sub, blockerTaskId: tasks.parent, createdBy: staffUser, createdAt: at })
  await db.insert(taskComments).values([
    { id: id('c1'), taskId: tasks.parent, userId: staffUser, body: 'internal note', visibility: 'internal', createdVia: 'ui', createdAt: at + 10, editedAt: at + 11 },
    { id: id('c2'), taskId: tasks.parent, userId: staffUser, body: 'customer note', visibility: 'customer', createdVia: 'mcp', createdAt: at + 12 }
  ])
  await db.insert(taskActivity).values({ id: id('act'), taskId: tasks.parent, projectId: project, actorId: staffUser, via: 'ui', kind: 'created', detail: { title: 'Parent card' }, createdAt: at + 1 })
  await db.insert(timeEntries).values({ id: id('time'), taskId: tasks.parent, projectId: project, userId: staffUser, minutes: 90, day: '2026-11-08', note: 'work', createdAt: at + 13 })
  await db.insert(projectStatusUpdates).values({ id: id('status'), projectId: project, userId: staffUser, status: 'at_risk', body: 'late', createdAt: at + 14 })
  await db.insert(projectMessages).values([
    { id: id('msg'), projectId: project, userId: staffUser, title: 'Hello', body: 'first', createdAt: at + 15 },
    { id: id('reply'), projectId: project, userId: staffUser, parentId: id('msg'), title: '', body: 'reply', createdAt: at + 16 }
  ])
  await db.insert(githubLinks).values({ id: id('gh'), projectId: project, taskId: tasks.parent, kind: 'pull', owner: 'acme', repo: 'app', ref: '12', url: 'https://github.com/acme/app/pull/12', visibility: 'internal', createdBy: staffUser, createdAt: at + 17 })
  await db.insert(projectRules).values({ id: id('rule'), projectId: project, name: 'Ship it', enabled: true, trigger: { kind: 'moved' }, conditions: [], actions: [], position: 0, createdBy: staffUser, createdAt: at, updatedAt: at })
  await db.insert(projectSecrets).values({ id: id('secret'), projectId: project, name: 'API_TOKEN', ciphertext: SECRET_MARKER, createdAt: at, updatedAt: at })

  const dir = attachmentsUtil.taskAttachmentDir(tasks.parent)
  mkdirSync(dir, { recursive: true })
  writeFileSync(`${dir}/${pngName}`, PNG)

  const request = {
    project: (await db.select().from(projects).where(eq(projects.id, project)))[0]!,
    viewerId: staffUser,
    keyId: null,
    keyName: 'test',
    callerId: staffUser,
    audience: 'staff',
    admin: true,
    only: null,
    columns: null,
    inlineAttachments: false,
    instance: 'test.local'
  }
  plan = await backup.prepareBackup(request)
  parsed = JSON.parse(await collect(backup.streamBoardBackup(plan)))
})

after(async () => {
  rmSync(attachmentsUtil.taskAttachmentDir(tasks.parent), { recursive: true, force: true })
  await db.delete(projects).where(eq(projects.id, project))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(user).where(inArray(user.id, [staffUser]))
})

test('the whole board validates against version 1 and its checksum holds', () => {
  const result = validateBoardBackup(parsed)
  assert.equal(result.ok, true, JSON.stringify(result.ok ? null : result.problems))
  assert.equal(backup.checksumOf(parsed), parsed.checksum)
})

test('the file is the canonical JSON of its own content: changing one byte breaks the checksum', () => {
  const changed = JSON.parse(JSON.stringify(parsed))
  changed.tasks[0].title = 'Changed'
  assert.notEqual(backup.checksumOf(changed), parsed.checksum)
})

test('source, format and counts describe what is in the file', () => {
  assert.equal(parsed.format, 'taskmanager-board-backup')
  assert.equal(parsed.version, 1)
  assert.deepEqual(parsed.source, { instance: 'test.local', boardId: project, boardName: `Backup board ${tag}` })
  assert.equal(parsed.counts.tasks, 3)
  assert.equal(parsed.counts.columns, 2)
  assert.equal(parsed.counts.messages, 2)
  assert.equal(parsed.counts.attachments, 1)
  assert.equal(parsed.counts.timeEntries, 1)
  assert.equal(parsed.counts.statusUpdates, 1)
  assert.equal(parsed.counts.fields, 1)
  assert.equal(parsed.counts.rules, 1)
})

test('timestamps are the database values to the millisecond', () => {
  const card = parsed.tasks.find((task: any) => task.id === tasks.parent)
  assert.equal(card.createdAt, at + 1)
  assert.equal(card.updatedAt, at + 2)
  assert.equal(card.completedAt, null)
  assert.equal(card.dueOn, '2026-12-01')
  assert.equal(parsed.board.createdAt, at)
  assert.equal(parsed.board.updatedAt, at + 5)
  const update = parsed.updates.find((row: any) => row.body === 'internal note')
  assert.equal(update.createdAt, at + 10)
  assert.equal(update.editedAt, at + 11)
  assert.equal(parsed.timeEntries[0].day, '2026-11-08')
  assert.equal(parsed.timeEntries[0].createdAt, at + 13)
})

test('subtasks, blockers, field values and GitHub links are re-linked by id', () => {
  const sub = parsed.tasks.find((task: any) => task.id === tasks.sub)
  assert.equal(sub.parentTaskId, tasks.parent)
  assert.deepEqual(sub.blockedBy, [tasks.parent])
  const card = parsed.tasks.find((task: any) => task.id === tasks.parent)
  assert.deepEqual(card.fieldValues, [{ fieldId, value: 'o1' }])
  assert.equal(card.github[0].kind, 'pull')
  assert.equal(card.github[0].url, 'https://github.com/acme/app/pull/12')
  assert.equal(card.labels[0], 'crew')
})

test('a trashed card is included and flagged', () => {
  const gone = parsed.tasks.find((task: any) => task.id === tasks.trashed)
  assert.equal(gone.trashed, true)
  assert.equal(gone.deletedAt, at + 8)
  assert.equal(gone.deletedVia, 'mcp')
  assert.equal(gone.deletedBy, parsed.people[0].key)
})

test('comments keep their visibility and who wrote them', () => {
  const internal = parsed.updates.find((row: any) => row.body === 'internal note')
  const customer = parsed.updates.find((row: any) => row.body === 'customer note')
  assert.equal(internal.visibility, 'internal')
  assert.equal(customer.visibility, 'customer')
  assert.equal(customer.createdVia, 'mcp')
  assert.equal(parsed.people.find((person: any) => person.key === customer.author).name, 'Staff Person')
})

test('messages keep their reply thread and status updates their words', () => {
  const reply = parsed.messages.find((row: any) => row.body === 'reply')
  assert.equal(reply.parentId, id('msg'))
  assert.equal(parsed.statusUpdates[0].status, 'at_risk')
  assert.equal(parsed.rules[0].enabled, true)
})

test('the viewer sees their own address; people are keyed, never by user id', () => {
  const person = parsed.people[0]
  assert.equal(person.email, `${staffUser}@arnotes.test`)
  assert.match(person.key, /^p\d+$/)
  // The id may appear only inside the address the viewer is allowed to see.
  assert.ok(!JSON.stringify(parsed).replaceAll(person.email, '').includes(staffUser), 'a user id leaked into the file')
})

test('the attachment is listed with its checksum; inline mode adds its bytes', async () => {
  const [file] = parsed.attachments
  assert.equal(file.filename, pngName)
  assert.equal(file.size, PNG.length)
  assert.equal(file.sha256.length, 64)
  assert.equal(file.data, undefined)
  const inline = await backup.prepareBackup({
    project: plan.request.project, viewerId: staffUser, keyId: null, keyName: 'test', callerId: staffUser, audience: 'staff', admin: true, only: null, columns: null, inlineAttachments: true, instance: 'test.local'
  })
  const withBytes = JSON.parse(await collect(backup.streamBoardBackup(inline)))
  assert.equal(Buffer.from(withBytes.attachments[0].data, 'base64').equals(PNG), true)
})

test('secrets and their values never appear in the file', () => {
  const text = JSON.stringify(parsed)
  assert.ok(!text.includes(SECRET_MARKER), 'a secret value leaked')
  assert.ok(!text.includes('API_TOKEN'), 'a secret name leaked')
  assert.ok(!text.includes('ciphertext'))
})

test('only= limits the cards and drops the board-level sections', async () => {
  const split = await backup.prepareBackup({
    project: plan.request.project, viewerId: staffUser, keyId: null, keyName: 'test', callerId: staffUser, audience: 'staff', admin: true, only: [tasks.parent], columns: null, inlineAttachments: false, instance: 'test.local'
  })
  const doc = JSON.parse(await collect(backup.streamBoardBackup(split)))
  assert.equal(validateBoardBackup(doc).ok, true)
  assert.deepEqual(doc.tasks.map((task: any) => task.id), [tasks.parent])
  assert.equal(doc.counts.messages, 0)
  assert.equal(doc.counts.statusUpdates, 0)
  assert.equal(doc.counts.rules, 0)
  assert.equal(doc.updates.length, 2)
})

test('columns= limits the cards to the named columns', async () => {
  const split = await backup.prepareBackup({
    project: plan.request.project, viewerId: staffUser, keyId: null, keyName: 'test', callerId: staffUser, audience: 'staff', admin: true, only: null, columns: ['Done'], inlineAttachments: false, instance: 'test.local'
  })
  const doc = JSON.parse(await collect(backup.streamBoardBackup(split)))
  assert.deepEqual(doc.tasks.map((task: any) => task.id), [tasks.trashed])
  assert.equal(doc.counts.columns, 2)
})

test('one backup at a time per board: the slot is held until the stream ends', async () => {
  const slot = backup.backupSlotKey(project, staffUser)
  assert.equal(backup.claimBackupSlot(slot), true)
  assert.equal(backup.claimBackupSlot(slot), false)
  backup.releaseBackupSlot(slot)
  assert.equal(backup.claimBackupSlot(slot), true)
  backup.releaseBackupSlot(slot)
})

test('the file name carries the board and the day', () => {
  assert.equal(backup.backupFileName('ScrapHeap Development Center!', new Date('2026-11-08T10:00:00Z')), 'scrapheap-development-center-backup-2026-11-08.json')
})

test('a parent card outside the split is not linked from its subtask', async () => {
  const split = await backup.prepareBackup({
    project: plan.request.project, viewerId: staffUser, keyId: null, keyName: 'test', callerId: staffUser, audience: 'staff', admin: true, only: [tasks.sub], columns: null, inlineAttachments: false, instance: 'test.local'
  })
  const doc = JSON.parse(await collect(backup.streamBoardBackup(split)))
  assert.equal(validateBoardBackup(doc).ok, true)
  assert.equal(doc.tasks[0].parentTaskId, null)
  assert.deepEqual(doc.tasks[0].blockedBy, [])
})
