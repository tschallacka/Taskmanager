// Deleting one attachment of a task: only the named file goes, the count drops by one, a name that is not a stored
// name is refused, the limit message says how many there are and how to free one, and the removal reads as a line in
// the activity. The route's guards: staff of the board may delete; a customer contact is refused; a crew's read-only
// shadow board refuses the delete (requireProject refuses every non-read there). The guards are called the way the
// route calls them. Written, not run yet.
// Run: TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_<key> node --import tsx --test tests/task-attachment-delete.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'
import { SAFE_FILENAME, attachmentLimitMessage, deleteTaskAttachment, countAttachments } from '../server/utils/attachments.ts'
import { briefOf } from '../server/utils/taskActivity.ts'

// Nitro provides createError as a global; the helpers under test expect it.
Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { attachCrew } = await import('../server/utils/crewBoards')
const { requireProject, requireStaff, requireTask } = await import('../server/utils/projects')
const { allowCrews, clearCrewLevels } = await import('./helpers/crewLevels')
const { crews, member, organization, projectColumns, projectTasks, projects, user, crewBoards } = schema

function folderWith(names: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'attach-delete-'))
  mkdirSync(dir, { recursive: true })
  for (const name of names) writeFileSync(join(dir, name), 'x')
  return dir
}

test('deleting one attachment removes only that file and the count drops by one', () => {
  const dir = folderWith(['a1.png', 'b2.jpg', 'c3.gif'])
  try {
    assert.equal(countAttachments(dir), 3)
    assert.equal(deleteTaskAttachment(dir, 'b2.jpg'), true)
    assert.deepEqual(readdirSync(dir).sort(), ['a1.png', 'c3.gif'])
    assert.equal(countAttachments(dir), 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a name that is not in the folder is reported as not removed, and nothing else goes', () => {
  const dir = folderWith(['a1.png'])
  try {
    assert.equal(deleteTaskAttachment(dir, 'missing9.png'), false)
    assert.deepEqual(readdirSync(dir), ['a1.png'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('only plain stored names pass the name rule; a path or a traversal is refused', () => {
  assert.equal(SAFE_FILENAME.test('ab12cd.png'), true)
  assert.equal(SAFE_FILENAME.test('../ab12cd.png'), false)
  assert.equal(SAFE_FILENAME.test('folder/ab12cd.png'), false)
  assert.equal(SAFE_FILENAME.test('..'), false)
  assert.equal(SAFE_FILENAME.test('ab12cd.png.exe'), false)
})

test('a full task says how many there are and how to free one', () => {
  assert.equal(attachmentLimitMessage(15), '15 of 15 attachments: delete one first')
})

test('a removal reads as a plain activity line that names no file', () => {
  assert.equal(briefOf({ kind: 'attachment_removed' }), 'Removed an attachment')
})

// ── Route guards, on the database harness ─────────────────────────────────────────────────────────────────────────

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `tad-${tag}-${name}`
const now = Date.now()

const staff = id('staff')
const boss = id('boss')
const outsider = id('outsider')
const realTeam = id('real-team')
const crewTeam = id('crew-team')
const crewId = id('crew')
const realBoard = id('real')
const taskId = id('task')
const columnId = id('column')

const createdUsers = [staff, boss, outsider]
const createdOrgs = [realTeam, crewTeam]
const createdProjects: string[] = [realBoard]

// A session-only event, the shape the route's guards read: the signed-in user and the active team.
const eventAs = (userId: string, activeOrganizationId: string | null, method = 'DELETE') =>
  ({ method, context: { session: { user: { id: userId }, session: { activeOrganizationId } } } }) as never

let shadowId = ''

before(async () => {
  const at = new Date()
  await db.insert(user).values([staff, boss, outsider].map(u => ({ id: u, name: u, email: `${u}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })))
  await db.insert(organization).values([realTeam, crewTeam].map(t => ({ id: t, name: t, slug: t, createdAt: at })))
  await db.insert(member).values([
    { id: id('m1'), organizationId: realTeam, userId: staff, role: 'member', createdAt: at },
    { id: id('m2'), organizationId: realTeam, userId: boss, role: 'owner', createdAt: at },
    { id: id('m3'), organizationId: crewTeam, userId: boss, role: 'owner', createdAt: at }
  ])
  await db.insert(projects).values({ id: realBoard, userId: boss, teamId: realTeam, name: 'Real board', createdAt: now, updatedAt: now })
  await db.insert(crews).values({ id: crewId, slug: `tad-${tag}`, name: 'Attachment crew', teamId: crewTeam, createdBy: boss, createdAt: now })
  await allowCrews(boss, realTeam, [realBoard])
  const link = await attachCrew({ crew: (await db.select().from(crews).where(eq(crews.id, crewId)))[0]!, projectId: realBoard, teamId: realTeam, userId: boss })
  shadowId = link.shadowProjectId
  createdProjects.push(shadowId)
  // The task lives on the real board; the column is set up by the board's own defaults in the app, so a plain row here.
  await db.insert(projectColumns).values({ id: columnId, projectId: realBoard, name: 'To do', position: 0, createdAt: now })
  await db.insert(projectTasks).values({ id: taskId, projectId: realBoard, columnId, title: 'Attachment check', position: 0, createdAt: now, updatedAt: now })
})

after(async () => {
  await clearCrewLevels()
  await db.delete(projectColumns).where(eq(projectColumns.projectId, realBoard))
  await db.delete(projectTasks).where(eq(projectTasks.projectId, realBoard))
  await db.delete(crewBoards).where(eq(crewBoards.crewId, crewId))
  await db.delete(crews).where(eq(crews.id, crewId))
  await db.delete(projects).where(inArray(projects.id, createdProjects))
  await db.delete(member).where(inArray(member.organizationId, createdOrgs))
  await db.delete(organization).where(inArray(organization.id, createdOrgs))
  await db.delete(user).where(inArray(user.id, createdUsers))
})

test('staff of the board may delete: the task and the staff check both pass', async () => {
  const { task, project } = await requireTask(eventAs(staff, realTeam), taskId)
  assert.equal(task.id, taskId)
  assert.doesNotThrow(() => requireStaff(project))
})

test('a customer contact is refused: the staff check says 403 for a customer audience', () => {
  assert.throws(() => requireStaff({ audience: 'customer' }), (e: { statusCode?: number }) => e.statusCode === 403)
})

test('a stranger with no access to the board gets not found, never the task', async () => {
  await assert.rejects(requireTask(eventAs(outsider, null), taskId), (e: { statusCode?: number }) => e.statusCode === 404)
})

test("a crew's read-only shadow board refuses the delete, and still lets staff read it", async () => {
  // The real board's staff reads the shadow board; any non-read request is refused there before a route runs.
  const read = await requireProject(eventAs(boss, realTeam, 'GET'), shadowId)
  assert.equal(read.readOnly, true)

  await assert.rejects(requireProject(eventAs(boss, realTeam, 'DELETE'), shadowId), (e: { statusCode?: number, message?: string }) =>
    e.statusCode === 403 && /read it, not change it/.test(e.message ?? ''))
})
