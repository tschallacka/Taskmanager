// The links an agent hands to a person (server/utils/shareLinks.ts): absolute, on the configured origin, and on the paths
// the app's routes use. get_task answers with its task's link. Needs the test database and the Nuxt aliases:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_<key> node --import tsx --test --test-force-exit tests/mcp-share-links.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { apiKeys, customerMembers, customers, notifications, organization, projectGuests, projects, projectColumns, projectTasks, taskComments, user } = schema
const { boardShareUrl, taskShareUrl, updateShareUrl } = await import('../server/utils/shareLinks')
const { MCP_TOOLS, SHARE_LINK_TOOLS } = await import('../server/utils/mcpRegistry')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `tsl-${tag}-${name}`
const owner = id('owner')
const board = id('board')
const column = id('column')
const task = `tslt${tag}`
const subtask = `tsls${tag}`
// A task the customer can see: on a shared board, it carries the board's public link (publicUrl).
const publicTask = `tslp${tag}`
const notifyTask = id('notify-task')
const notifyBoard = id('notify-board')
// A comment keeps the key it came in on (a foreign key), so the update test needs a real key row.
const keyRow = id('key')
// Another person's board, on which the owner is only a guest: the owner's key sees it as a customer's would.
const other = id('other')
const otherBoard = id('other-board')
const otherColumn = id('other-column')
const otherTask = `tslo${tag}`
const otherGuest = id('guest')
// A customer's board: its contact is a customer member, not the owner, so the contact's key is a customer's key.
const team = id('team')
const customer = id('customer')
const contact = id('contact')
const customerBoard = id('customer-board')
const customerColumn = id('customer-column')
const customerTask = `tslc${tag}`
const origin = 'https://tasks.example.test'
const saved = process.env.BETTER_AUTH_URL

type Scope = 'boards:read' | 'boards:write'

/** The context of an agent's key, as the MCP hands it to a tool: a staff key of the owner unless told otherwise. */
function agentContext({ userId = owner, customerId = null, scopes = ['boards:read'] }: { userId?: string, customerId?: string | null, scopes?: Scope[] } = {}) {
  return {
    keyId: keyRow,
    keyName: 'share test',
    userId,
    teamId: null,
    customerId,
    projectId: null,
    scopes,
    reach: { allBoards: true, workspaceTeamIds: [], boardIds: [] },
    memberTeamIds: []
  }
}

before(async () => {
  process.env.BETTER_AUTH_URL = origin
  const at = new Date()
  await db.insert(user).values({ id: owner, name: owner, email: `${owner}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })
  const now = Date.now()
  await db.insert(apiKeys).values({ id: keyRow, userId: owner, name: 'share test', keyHash: `${tag}-hash`, keyPrefix: 'tsl', createdAt: now, allBoards: true, boardReachSet: true })
  await db.insert(projects).values({ id: board, userId: owner, name: 'Share board', createdAt: now, updatedAt: now })
  await db.insert(projectColumns).values({ id: column, projectId: board, name: 'To do', position: 0, createdAt: now })
  await db.insert(projectTasks).values({ id: task, projectId: board, columnId: column, title: 'Share me', visibility: 'internal', assigneeId: owner, position: 0, createdAt: now, updatedAt: now })
  // A subtask of the task, assigned to the same owner, so my_tasks shows its parent with a link.
  await db.insert(projectTasks).values({ id: publicTask, projectId: board, columnId: column, title: 'Customer can see this', visibility: 'customer', position: 2, createdAt: now, updatedAt: now })
  await db.insert(projectTasks).values({ id: subtask, projectId: board, columnId: column, parentTaskId: task, title: 'Share the subtask', visibility: 'internal', assigneeId: owner, position: 1, createdAt: now, updatedAt: now })
  await db.insert(user).values({ id: other, name: other, email: `${other}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(projects).values({ id: otherBoard, userId: other, name: 'Someone else board', createdAt: now, updatedAt: now })
  await db.insert(projectColumns).values({ id: otherColumn, projectId: otherBoard, name: 'To do', position: 0, createdAt: now })
  await db.insert(projectTasks).values({ id: otherTask, projectId: otherBoard, columnId: otherColumn, title: 'Theirs', visibility: 'customer', position: 0, createdAt: now, updatedAt: now })
  await db.insert(projectGuests).values({ id: otherGuest, projectId: otherBoard, userId: owner, role: 'editor', addedBy: other, createdAt: now })
  await db.insert(organization).values({ id: team, name: 'Share team', slug: team, createdAt: at })
  await db.insert(user).values({ id: contact, name: contact, email: `${contact}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(customers).values({ id: customer, organizationId: team, name: 'Share customer', createdAt: now, updatedAt: now })
  await db.insert(customerMembers).values({ id: id('cm'), customerId: customer, userId: contact, createdAt: now })
  await db.insert(projects).values({ id: customerBoard, userId: owner, customerId: customer, name: 'Customer board', createdAt: now, updatedAt: now })
  await db.insert(projectColumns).values({ id: customerColumn, projectId: customerBoard, name: 'To do', position: 0, createdAt: now })
  await db.insert(projectTasks).values({ id: customerTask, projectId: customerBoard, columnId: customerColumn, title: 'For the customer', visibility: 'customer', position: 0, createdAt: now, updatedAt: now })
  await db.insert(notifications).values([
    { id: notifyTask, userId: owner, type: 'assigned', projectId: board, taskId: task, title: 'Assigned: Share me', createdAt: now },
    { id: notifyBoard, userId: owner, type: 'update', projectId: board, title: 'Board news', createdAt: now }
  ])
})

after(async () => {
  await db.delete(projectTasks).where(eq(projectTasks.id, subtask))
  await db.delete(projectTasks).where(eq(projectTasks.id, task))
  await db.delete(projectTasks).where(eq(projectTasks.id, publicTask))
  await db.delete(projectColumns).where(eq(projectColumns.id, column))
  await db.delete(projects).where(eq(projects.id, board))
  await db.delete(projectTasks).where(eq(projectTasks.id, otherTask))
  await db.delete(projectColumns).where(eq(projectColumns.id, otherColumn))
  await db.delete(projects).where(eq(projects.id, otherBoard))
  await db.delete(projectTasks).where(eq(projectTasks.id, customerTask))
  await db.delete(projectColumns).where(eq(projectColumns.id, customerColumn))
  await db.delete(projects).where(eq(projects.id, customerBoard))
  await db.delete(customers).where(eq(customers.id, customer))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(user).where(inArray(user.id, [owner, other, contact]))
  if (saved === undefined) delete process.env.BETTER_AUTH_URL
  else process.env.BETTER_AUTH_URL = saved
  await db.$client.end()
})

test('the links are absolute on the configured origin and use the app routes', () => {
  assert.equal(boardShareUrl('b1'), `${origin}/projects/b1`)
  assert.equal(taskShareUrl('b1', 't1'), `${origin}/projects/b1?task=t1`)
  assert.equal(updateShareUrl('b1', 't1', 'u1'), `${origin}/projects/b1?task=t1&comment=u1`)
})

test('the origin has no trailing slash, and falls back to localhost without the setting', () => {
  process.env.BETTER_AUTH_URL = `${origin}/`
  assert.equal(boardShareUrl('b1'), `${origin}/projects/b1`)
  delete process.env.BETTER_AUTH_URL
  assert.equal(boardShareUrl('b1'), 'http://localhost:3000/projects/b1')
  process.env.BETTER_AUTH_URL = origin
})

test('get_task answers with the task\'s link to share', async () => {
  const tool = MCP_TOOLS.find(t => t.name === 'get_task')!
  const answer = await tool.handler({ id: task }, agentContext()) as { url?: string }
  assert.equal(answer.url, `${origin}/projects/${board}?task=${task}`)
})

test('create_task, update_task and move_task answer with the absolute link of the task they touched', async () => {
  const context = agentContext({ scopes: ['boards:read', 'boards:write'] })
  const created = await MCP_TOOLS.find(t => t.name === 'create_task')!.handler({ board, column: 'To do', title: 'Made by agent' }, context) as { task: { id: string, url?: string } }
  assert.equal(created.task.url, `${origin}/projects/${board}?task=${created.task.id}`)
  const updated = await MCP_TOOLS.find(t => t.name === 'update_task')!.handler({ id: created.task.id, title: 'Renamed' }, context) as { task: { url?: string } }
  assert.equal(updated.task.url, `${origin}/projects/${board}?task=${created.task.id}`)
  const moved = await MCP_TOOLS.find(t => t.name === 'move_task')!.handler({ id: created.task.id, column }, context) as { task: { url?: string } }
  assert.equal(moved.task.url, `${origin}/projects/${board}?task=${created.task.id}`)
  await db.delete(projectTasks).where(eq(projectTasks.id, created.task.id))
})

test('list_boards answers each board with its absolute link', async () => {
  const answer = await MCP_TOOLS.find(t => t.name === 'list_boards')!.handler({}, agentContext()) as { boards: { id: string, url?: string }[] }
  const mine = answer.boards.find(b => b.id === board)
  assert.ok(mine, 'the test board is listed')
  assert.equal(mine.url, `${origin}/projects/${board}`)
})

test('post_task_update answers with the absolute link of the update, at that update', async () => {
  const context = agentContext({ scopes: ['boards:read', 'boards:write'] })
  const answer = await MCP_TOOLS.find(t => t.name === 'post_task_update')!.handler({ id: task, body: 'Link check' }, context) as { update: { id: string, url?: string } }
  assert.equal(answer.update.url, `${origin}/projects/${board}?task=${task}&comment=${answer.update.id}`)
  await db.delete(taskComments).where(eq(taskComments.id, answer.update.id))
})

test('list_notifications answers each notification with the link the Inbox opens: the task, or the board', async () => {
  const answer = await MCP_TOOLS.find(t => t.name === 'list_notifications')!.handler({}, agentContext()) as { notifications: { id: string, url?: string }[] }
  const onTask = answer.notifications.find(n => n.id === notifyTask)
  const onBoard = answer.notifications.find(n => n.id === notifyBoard)
  assert.equal(onTask?.url, `${origin}/projects/${board}?task=${task}`)
  assert.equal(onBoard?.url, `${origin}/projects/${board}`)
})

test('my_tasks answers each task, and each subtask\'s parent, with its absolute link', async () => {
  const answer = await MCP_TOOLS.find(t => t.name === 'my_tasks')!.handler({}, agentContext()) as { tasks: { id: string, url?: string, parent?: { id: string, url?: string } }[] }
  const mine = answer.tasks.find(t => t.id === task)
  const child = answer.tasks.find(t => t.id === subtask)
  assert.ok(mine && child, 'the task and its subtask are listed')
  assert.equal(mine.url, `${origin}/projects/${board}?task=${task}`)
  // A subtask has no panel of its own in the app (the drawer finds only the board's own tasks), so its link is its parent's.
  assert.equal(child.url, `${origin}/projects/${board}?task=${task}`)
  assert.equal(child.parent?.id, task)
  assert.equal(child.parent?.url, `${origin}/projects/${board}?task=${task}`)
})

test('delete_task answers with the board\'s link (a trashed task has no page of its own); restore_task answers with the task\'s link', async () => {
  const context = agentContext({ scopes: ['boards:read', 'boards:write'] })
  const created = await MCP_TOOLS.find(t => t.name === 'create_task')!.handler({ board, column: 'To do', title: 'To trash and back' }, context) as { task: { id: string } }
  const trashed = await MCP_TOOLS.find(t => t.name === 'delete_task')!.handler({ id: created.task.id }, context) as { url?: string }
  assert.equal(trashed.url, `${origin}/projects/${board}`)
  const restored = await MCP_TOOLS.find(t => t.name === 'restore_task')!.handler({ id: created.task.id }, context) as { url?: string }
  assert.equal(restored.url, `${origin}/projects/${board}?task=${created.task.id}`)
  await db.delete(projectTasks).where(eq(projectTasks.id, created.task.id))
})

test('delete_task_update answers with the link of the task the update was on', async () => {
  const context = agentContext({ scopes: ['boards:read', 'boards:write'] })
  const posted = await MCP_TOOLS.find(t => t.name === 'post_task_update')!.handler({ id: task, body: 'Delete me' }, context) as { update: { id: string } }
  const deleted = await MCP_TOOLS.find(t => t.name === 'delete_task_update')!.handler({ id: task, updateId: posted.update.id }, context) as { task: { url?: string } }
  assert.equal(deleted.task.url, `${origin}/projects/${board}?task=${task}`)
})

test('get_task_github answers with the task\'s absolute link', async () => {
  const answer = await MCP_TOOLS.find(t => t.name === 'get_task_github')!.handler({ taskId: task }, agentContext()) as { task: string, url?: string }
  assert.equal(answer.task, task)
  assert.equal(answer.url, `${origin}/projects/${board}?task=${task}`)
})

test('every tool that answers with a task, board or update says in its description that url is the link to share', () => {
  const linkTools = [...SHARE_LINK_TOOLS]
  assert.equal(linkTools.length, 15, 'the registry lists the fifteen link tools')
  for (const name of linkTools) {
    const tool = MCP_TOOLS.find(t => t.name === name)
    assert.ok(tool, `${name} is a tool`)
    assert.match(tool.description, /url is the link to share/, `${name} says url is the link to share`)
  }
})

test('the tools help page says which link an answer carries and that it is the one to share', async () => {
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const page = readFileSync(fileURLToPath(new URL('../docs/agents/tools-overview.md', import.meta.url)), 'utf8')
  assert.match(page, /## Links to share/, 'the page has a Links to share section')
  assert.match(page, /`url`/, 'the page names the url field')
  assert.match(page, /link to share with a person/, 'the page says url is the link to share with a person')
})

test('a guest\'s key gets no staff link on another person\'s board: get_board, list_boards and post_task_update', async () => {
  const context = agentContext({ scopes: ['boards:read', 'boards:write'] })
  const shown = await MCP_TOOLS.find(t => t.name === 'get_board')!.handler({ board: otherBoard }, context) as { id: string, url?: string }
  assert.equal(shown.id, otherBoard)
  assert.equal(shown.url, undefined, 'get_board gives a guest no staff board link')
  const listed = await MCP_TOOLS.find(t => t.name === 'list_boards')!.handler({}, context) as { boards: { id: string, url?: string }[] }
  const mine = listed.boards.find(b => b.id === otherBoard)
  assert.ok(mine, 'the other board is listed for the guest')
  assert.equal(mine.url, undefined, 'list_boards gives a guest no staff board link')
  const posted = await MCP_TOOLS.find(t => t.name === 'post_task_update')!.handler({ id: otherTask, body: 'Guest note' }, context) as { update: { id: string, url?: string } }
  assert.equal(posted.update.url, undefined, 'post_task_update gives a guest no staff update link')
  await db.delete(taskComments).where(eq(taskComments.id, posted.update.id))
})

test('a customer\'s key gets no staff link: get_board and get_task on the customer\'s board, read by the customer\'s contact', async () => {
  const context = agentContext({ userId: contact, customerId: customer })
  const shown = await MCP_TOOLS.find(t => t.name === 'get_board')!.handler({ board: customerBoard }, context) as { id: string, url?: string, columns: { tasks: { id: string, url?: string }[] }[] }
  assert.equal(shown.id, customerBoard)
  assert.equal(shown.url, undefined, 'get_board gives a customer\'s key no staff board link')
  const card = shown.columns.flatMap(c => c.tasks).find(t => t.id === customerTask)
  assert.ok(card, 'the customer-visible task is on the board')
  assert.equal(card.url, undefined, 'the board\'s cards carry no staff task link for a customer\'s key')
  const got = await MCP_TOOLS.find(t => t.name === 'get_task')!.handler({ id: customerTask }, context) as { url?: string }
  assert.equal(got.url, undefined, 'get_task gives a customer\'s key no staff task link')
})

test('the e-mail and push link to a subtask opens its parent\'s panel, as the inbox link does', async () => {
  const { notificationPath } = await import('../server/utils/notifications')
  const onSubtask = await notificationPath({ project: { id: board, name: 'Share board', userId: owner, teamId: null, customerId: null }, task: { id: subtask, title: 'Share the subtask', visibility: 'internal' }, actorId: null, type: 'assigned', recipients: [], title: 'x' })
  assert.equal(onSubtask, `/projects/${board}?task=${task}`)
  const onTask = await notificationPath({ project: { id: board, name: 'Share board', userId: owner, teamId: null, customerId: null }, task: { id: task, title: 'Share me', visibility: 'internal' }, actorId: null, type: 'assigned', recipients: [], title: 'x' })
  assert.equal(onTask, `/projects/${board}?task=${task}`)
})

test('a customer-visible task on a shared board carries the board\'s public link (publicUrl); an internal task and a private board carry none', async () => {
  const context = agentContext()
  const get = MCP_TOOLS.find(t => t.name === 'get_task')!
  await db.update(projects).set({ isPublic: true, publicUntil: null }).where(eq(projects.id, board))
  const shown = await get.handler({ id: publicTask }, context) as { publicUrl?: string }
  assert.equal(shown.publicUrl, `${origin}/public/project/${board}`)
  const internal = await get.handler({ id: task }, context) as { publicUrl?: string }
  assert.equal(internal.publicUrl, undefined, 'an internal task has no public link')
  await db.update(projects).set({ isPublic: false }).where(eq(projects.id, board))
  const privateNow = await get.handler({ id: publicTask }, context) as { publicUrl?: string }
  assert.equal(privateNow.publicUrl, undefined, 'a board that is not shared gives no public link')
})

test('the public link is on every task answer for a customer-visible task of a shared board: get_board and update_task', async () => {
  const context = agentContext({ scopes: ['boards:read', 'boards:write'] })
  await db.update(projects).set({ isPublic: true, publicUntil: null }).where(eq(projects.id, board))
  try {
    const shown = await MCP_TOOLS.find(t => t.name === 'get_board')!.handler({ board }, context) as { columns: { tasks: { id: string, publicUrl?: string }[] }[] }
    const card = shown.columns.flatMap(c => c.tasks).find(t => t.id === publicTask)
    assert.ok(card, 'the customer-visible task is on the board')
    assert.equal(card.publicUrl, `${origin}/public/project/${board}`, 'get_board gives the card its public link')
    const internal = shown.columns.flatMap(c => c.tasks).find(t => t.id === task)
    assert.equal(internal?.publicUrl, undefined, 'an internal card has no public link')
    const updated = await MCP_TOOLS.find(t => t.name === 'update_task')!.handler({ id: publicTask, title: 'Customer can see this' }, context) as { task: { publicUrl?: string } }
    assert.equal(updated.task.publicUrl, `${origin}/public/project/${board}`, 'update_task gives the task its public link')
  } finally {
    await db.update(projects).set({ isPublic: false }).where(eq(projects.id, board))
  }
})

test('get_board answers with the board\'s absolute link', async () => {
  const answer = await MCP_TOOLS.find(t => t.name === 'get_board')!.handler({ board }, agentContext()) as { id: string, url?: string }
  assert.equal(answer.id, board)
  assert.equal(answer.url, `${origin}/projects/${board}`)
})

test('edit_task_update answers with the absolute link of the edited update', async () => {
  const context = agentContext({ scopes: ['boards:read', 'boards:write'] })
  const posted = await MCP_TOOLS.find(t => t.name === 'post_task_update')!.handler({ id: task, body: 'Before the edit' }, context) as { update: { id: string } }
  const edited = await MCP_TOOLS.find(t => t.name === 'edit_task_update')!.handler({ id: task, updateId: posted.update.id, body: 'After the edit' }, context) as { update: { id: string, url?: string } }
  assert.equal(edited.update.url, `${origin}/projects/${board}?task=${task}&comment=${posted.update.id}`)
  await db.delete(taskComments).where(eq(taskComments.id, posted.update.id))
})
