// The account download (Art. 20, card mwjfpr8phz5gi4bdjqa): exportAccount takes what EXPORT_RULES allows for one person,
// and nothing else. A fixture person has a board, a task, a comment, a time entry, a status update, settings, an API
// key, a session and a passkey; another person has a comment on the same board. The export holds the person's own rows
// and none of the secrets or the other person's data. Needs the test database and the Nuxt aliases. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_wren node --import tsx --test --test-force-exit tests/account-export.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { inArray, eq } from 'drizzle-orm'
import { EXPORT_SECRET_COLUMN } from '../server/utils/accountRules'

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { exportAccount } = await import('../server/utils/accountExport')
const { user, session, projects, projectColumns, projectTasks, taskComments, timeEntries, projectStatusUpdates, userSettings, userEmail, projectMembers, apiKeys, passkey } = schema

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `exp-${tag}-${name}`
const now = Date.now()
const at = new Date()

const leaver = id('leaver')
const other = id('other')
const board = id('board')
const column = id('column')
const ownTask = id('task-own')
const otherTask = id('task-other')
const comment = id('comment')
const otherComment = id('comment-other')
const time = id('time')
const status = id('status')
const keyId = id('key')
const keyHash = `HASH-${tag}-SECRET`
const sessionToken = `TOKEN-${tag}-SECRET`
const aiKey = `sk-${tag}-SECRET`
const ownNote = `note ${tag}`
const otherEmail = `${other}@staff.test`

before(async () => {
  await db.insert(user).values([
    { id: leaver, name: 'Leaving person', email: `${leaver}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at },
    { id: other, name: 'Other person', email: otherEmail, emailVerified: true, createdAt: at, updatedAt: at }
  ])
  await db.insert(session).values({ id: id('session'), token: sessionToken, userId: leaver, expiresAt: new Date(now + 86_400_000), createdAt: at, updatedAt: at })
  await db.insert(userEmail).values({ id: id('extra'), userId: leaver, email: `${id('extra')}@example.test`, verifiedAt: at, createdAt: at } as never)
  await db.insert(userSettings).values({ userId: leaver, primaryColor: 'teal', neutralColor: 'slate', openrouterApiKey: aiKey, updatedAt: at } as never)
  await db.insert(apiKeys).values({ id: keyId, userId: leaver, name: 'laptop', keyHash, keyPrefix: 'tm_live', createdAt: now } as never)
  await db.insert(passkey).values({ id: id('passkey'), userId: leaver, name: 'phone', publicKey: `PK-${tag}`, credentialID: `cred-${tag}`, counter: 0, deviceType: 'singleDevice', backedUp: false, transports: '', createdAt: at } as never)
  await db.insert(projects).values({ id: board, userId: leaver, teamId: null, name: 'Own board', createdAt: now, updatedAt: now })
  await db.insert(projectColumns).values({ id: column, projectId: board, name: 'To do', position: 0, createdAt: now })
  await db.insert(projectMembers).values({ id: id('pm-other'), projectId: board, userId: other, role: 'member', createdAt: now, addedBy: leaver } as never)
  await db.insert(projectTasks).values([
    { id: ownTask, projectId: board, columnId: column, title: 'Written by the leaver', position: 0, createdAt: now, updatedAt: now, createdBy: leaver },
    { id: otherTask, projectId: board, columnId: column, title: 'Written by the other person', position: 1, createdAt: now, updatedAt: now, createdBy: other }
  ])
  await db.insert(taskComments).values([
    { id: comment, taskId: ownTask, userId: leaver, body: 'The leaver\'s comment', createdAt: now },
    { id: otherComment, taskId: otherTask, userId: other, body: 'The other person\'s private words', createdAt: now }
  ])
  await db.insert(timeEntries).values({ id: time, taskId: ownTask, projectId: board, userId: leaver, minutes: 45, day: '2026-11-10', note: ownNote, createdAt: now })
  await db.insert(projectStatusUpdates).values({ id: status, projectId: board, userId: leaver, status: 'on_track', body: 'Status by the leaver', createdAt: now } as never)
})

after(async () => {
  await db.delete(projects).where(eq(projects.id, board))
  await db.delete(user).where(inArray(user.id, [leaver, other]))
  await db.$client.end()
})

// Every key in the export, at any depth.
function keysOf(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) for (const item of value) keysOf(item, out)
  else if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      out.push(key)
      keysOf(inner, out)
    }
  }
  return out
}

test('the export holds the person\'s own rows: account, settings, boards, what they wrote', async () => {
  const data = await exportAccount(leaver)
  assert.equal(data.format, 'taskmanager-account-export')
  assert.equal(data.version, 1)
  assert.equal(data.account.name, 'Leaving person')
  assert.equal(data.account.email, `${leaver}@staff.test`)
  assert.ok(data.account.addresses.some((row: { email: string }) => row.email.endsWith('@example.test')))
  for (const row of data.account.addresses) assert.deepEqual(Object.keys(row).sort(), ['email', 'verified_at'])
  assert.equal(data.settings.colours[0].primary_color, 'teal')
  assert.ok(data.owned_boards.some((row: { name: string }) => row.name === 'Own board'))
  assert.ok(data.authored.tasks.some((row: { title: string }) => row.title === 'Written by the leaver'))
  assert.ok(data.authored.comments.some((row: { body: string }) => row.body === 'The leaver\'s comment'))
  assert.ok(data.authored.time_entries.some((row: { note: string }) => row.note === ownNote))
  assert.ok(data.authored.status_updates.some((row: { body: string }) => row.body === 'Status by the leaver'))
})

test('the export never holds a secret: no key hash, no API key, no AI key, no session token, no passkey data', async () => {
  const text = JSON.stringify(await exportAccount(leaver))
  for (const secret of [keyHash, sessionToken, aiKey, `PK-${tag}`, `cred-${tag}`]) {
    assert.equal(text.includes(secret), false, `the export holds ${secret.slice(0, 8)}...`)
  }
})

test('the export holds no key whose name looks like a secret', async () => {
  const bad = keysOf(await exportAccount(leaver)).filter(key => EXPORT_SECRET_COLUMN.test(key))
  assert.deepEqual(bad, [], `secret-looking keys: ${bad.join(', ')}`)
})

test('the export holds nothing of another person: their comment, their email, their name', async () => {
  const text = JSON.stringify(await exportAccount(leaver))
  assert.equal(text.includes('The other person\'s private words'), false)
  assert.equal(text.includes(otherEmail), false)
  assert.equal(text.includes('Other person'), false)
  assert.equal(text.includes('Written by the other person'), false)
})

test('a section over the row limit says so with its total count, and holds only the limit', async () => {
  const normal = await exportAccount(leaver)
  assert.equal(normal.truncated, false)
  assert.deepEqual(normal.truncated_sections, [])

  const data = await exportAccount(leaver, { rowLimit: 0 })
  assert.equal(data.truncated, true, 'the top-level flag is set')
  assert.deepEqual(data.authored.tasks, [])
  const cut = data.truncated_sections.find(entry => entry.section === 'authored.tasks')
  assert.ok(cut, 'the tasks section is listed as cut')
  assert.equal(cut.limit, 0)
  assert.equal(cut.total, normal.authored.tasks.length, 'the count is the full number of rows, not the limit')
  assert.ok(cut.total > 0, 'the fixture has tasks to count')
})
