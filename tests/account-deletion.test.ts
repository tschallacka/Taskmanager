// Deleting an account does what the rule table says (card mwjfpokj5rvl92bserd): a personal board with no other member
// goes with its tasks and attachment files; a team board stays with the 'Deleted user' name on the person's work; a
// comment and a time entry keep their text; a column the person filled in is cleared; the sessions and memberships go;
// another person's data is untouched. Needs the test database and the Nuxt aliases. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_wren node --import tsx --test --test-force-exit tests/account-deletion.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { DELETED_USER_ID } = await import('../server/utils/accountRules')
const { deleteAccount } = await import('../server/utils/accountDeletion')
const { taskAttachmentDir } = await import('../server/utils/attachments')
const { avatarDir } = await import('../server/utils/avatarStore')
const { user, session, organization, member, projects, projectColumns, projectTasks, taskComments, timeEntries, goals, projectMembers } = schema

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `del-${tag}-${name}`
const now = Date.now()
const at = new Date()

const leaver = id('leaver')
const other = id('other')
const team = id('team')
const teamBoard = id('team-board')
const personalBoard = id('personal-board')
const sharedPersonalBoard = id('shared-personal-board')
const column = id('column')
const taskOnTeam = id('task-team')
const taskOnPersonal = id('task-personal')
const otherTask = id('task-other')
const teamGoal = id('goal-team')
const personalGoal = id('goal-personal')
const sessionId = id('session')
const attachmentTask = taskOnPersonal

before(async () => {
  await db.insert(user).values([
    { id: leaver, name: 'Leaving person', email: `${leaver}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at },
    { id: other, name: 'Staying person', email: `${other}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at }
  ])
  await db.insert(organization).values({ id: team, name: 'Delete team', slug: team, createdAt: at })
  await db.insert(member).values([
    { id: id('m-leaver'), organizationId: team, userId: leaver, role: 'member', createdAt: at },
    { id: id('m-other'), organizationId: team, userId: other, role: 'owner', createdAt: at }
  ])
  await db.insert(session).values({ id: sessionId, token: id('token'), userId: leaver, expiresAt: new Date(now + 86_400_000), createdAt: at, updatedAt: at })
  await db.insert(projects).values([
    { id: teamBoard, userId: leaver, teamId: team, name: 'Team board', createdAt: now, updatedAt: now },
    { id: personalBoard, userId: leaver, teamId: null, name: 'Personal board', createdAt: now, updatedAt: now },
    { id: sharedPersonalBoard, userId: leaver, teamId: null, name: 'Shared personal board', createdAt: now, updatedAt: now },
    { id: id('other-personal'), userId: other, teamId: null, name: 'Other personal board', createdAt: now, updatedAt: now }
  ])
  await db.insert(projectMembers).values({ id: id('pm'), projectId: sharedPersonalBoard, userId: other, role: 'member', createdAt: now, addedBy: leaver } as never)
  await db.insert(projectColumns).values([
    { id: column, projectId: teamBoard, name: 'To do', position: 0, createdAt: now },
    { id: id('column-p'), projectId: personalBoard, name: 'To do', position: 0, createdAt: now }
  ])
  await db.insert(projectTasks).values([
    { id: taskOnTeam, projectId: teamBoard, columnId: column, title: 'On the team board', position: 0, createdAt: now, updatedAt: now, createdBy: leaver },
    { id: taskOnPersonal, projectId: personalBoard, columnId: id('column-p'), title: 'On the personal board', position: 0, createdAt: now, updatedAt: now },
    { id: otherTask, projectId: teamBoard, columnId: column, title: 'Another person\'s task', position: 1, createdAt: now, updatedAt: now, createdBy: other, assigneeId: leaver }
  ])
  await db.insert(taskComments).values({ id: id('comment'), taskId: otherTask, userId: leaver, body: 'Words the team read', createdAt: now })
  await db.insert(timeEntries).values({ id: id('time'), taskId: otherTask, projectId: teamBoard, userId: leaver, minutes: 45, day: '2026-11-10', note: 'work', createdAt: now })
  await db.insert(goals).values([
    { id: teamGoal, userId: leaver, teamId: team, title: 'Team goal', createdAt: now, updatedAt: now },
    { id: personalGoal, userId: leaver, teamId: null, title: 'Personal goal', createdAt: now, updatedAt: now }
  ])
  // A task attachment on the personal board: its file goes with the board.
  const dir = taskAttachmentDir(attachmentTask)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'abc123.png'), 'x')
  // The profile picture folder: one folder per person, from avatarDir, removed with the account.
  mkdirSync(avatarDir(leaver), { recursive: true })
  writeFileSync(join(avatarDir(leaver), `${'a'.repeat(24)}.png`), 'x')
})

after(async () => {
  await db.delete(projects).where(inArray(projects.id, [teamBoard, sharedPersonalBoard, id('other-personal')]))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(user).where(inArray(user.id, [other, DELETED_USER_ID]))
  rmSync(taskAttachmentDir(attachmentTask), { recursive: true, force: true })
  rmSync(avatarDir(leaver), { recursive: true, force: true })
  await db.$client.end()
})

test('deleting an account follows the rules for each kind of data', async () => {
  const result = await deleteAccount(leaver)
  assert.ok(result.deletedBoards.includes(personalBoard), 'the personal board with no other member is deleted')
  assert.ok(result.tombstonedBoards.includes(teamBoard), 'the team board stays')

  // Deleted: the board, its tasks, its attachment file, the session, the membership.
  const [gone] = await db.select().from(projects).where(eq(projects.id, personalBoard))
  assert.equal(gone, undefined)
  const [goneTask] = await db.select().from(projectTasks).where(eq(projectTasks.id, taskOnPersonal))
  assert.equal(goneTask, undefined)
  assert.equal(existsSync(taskAttachmentDir(attachmentTask)), false, 'the attachment file is gone from disk')
  assert.equal(existsSync(avatarDir(leaver)), false, 'the profile picture folder is gone from disk')
  const [goneSession] = await db.select().from(session).where(eq(session.id, sessionId))
  assert.equal(goneSession, undefined)
  const [goneMember] = await db.select().from(member).where(eq(member.userId, leaver))
  assert.equal(goneMember, undefined)

  // Kept with the 'Deleted user' name: the team board, the comment and the time entry keep their text.
  const [team] = await db.select().from(projects).where(eq(projects.id, teamBoard))
  assert.equal(team?.userId, DELETED_USER_ID)
  const [comment] = await db.select().from(taskComments).where(eq(taskComments.id, id('comment')))
  assert.equal(comment?.body, 'Words the team read')
  assert.equal(comment?.userId, DELETED_USER_ID)
  const [entry] = await db.select().from(timeEntries).where(eq(timeEntries.id, id('time')))
  assert.equal(entry?.minutes, 45)
  assert.equal(entry?.userId, DELETED_USER_ID)

  // Cleared: a column the person filled in on someone else's task.
  const [task] = await db.select().from(projectTasks).where(eq(projectTasks.id, taskOnTeam))
  assert.ok(task, 'the task stays')
  assert.equal(task?.createdBy, null, 'the creator column is cleared; the task keeps its text')

  // Goals: team-scoped kept as the tombstone's, personal deleted.
  const [teamG] = await db.select().from(goals).where(eq(goals.id, teamGoal))
  assert.equal(teamG?.userId, DELETED_USER_ID)
  const [personalG] = await db.select().from(goals).where(eq(goals.id, personalGoal))
  assert.equal(personalG, undefined)

  // The shared personal board: another person is on it, so it stays with the tombstone.
  const [shared] = await db.select().from(projects).where(eq(projects.id, sharedPersonalBoard))
  assert.equal(shared?.userId, DELETED_USER_ID)

  // The person's row is gone, and the tombstone row exists with no sign-in.
  const [leaverRow] = await db.select().from(user).where(eq(user.id, leaver))
  assert.equal(leaverRow, undefined)
  const [tombstone] = await db.select().from(user).where(eq(user.id, DELETED_USER_ID))
  assert.equal(tombstone?.name, 'Deleted user')
})

test('another person is not touched by the deletion', async () => {
  const [otherRow] = await db.select().from(user).where(eq(user.id, other))
  assert.equal(otherRow?.name, 'Staying person')
  const [otherBoard] = await db.select().from(projects).where(eq(projects.id, id('other-personal')))
  assert.equal(otherBoard?.userId, other)
  const [otherMembership] = await db.select().from(member).where(eq(member.userId, other))
  assert.ok(otherMembership, 'the other owner keeps the team')
  const [otherTaskRow] = await db.select().from(projectTasks).where(eq(projectTasks.id, otherTask))
  assert.equal(otherTaskRow?.createdBy, other)
})

test('the deletion finds the profile picture folder through avatarStore, not its own path', () => {
  // A second copy of the path would go stale when avatarStore moves, and a deleted account would keep its picture on disk.
  const source = readFileSync(join(process.cwd(), 'server', 'utils', 'accountDeletion.ts'), 'utf8')
  assert.match(source, /avatarDir\(userId\)/)
  assert.doesNotMatch(source, /'avatars'/)
})

test('deleting again is a no-op: the person no longer exists', async () => {
  const again = await deleteAccount(leaver)
  assert.deepEqual(again.deletedBoards, [])
})
