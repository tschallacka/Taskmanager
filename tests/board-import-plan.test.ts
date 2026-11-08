/* eslint-disable @typescript-eslint/no-explicit-any -- the plan is read loosely: each test checks the rows it names */
// The planning step of a board import, on a fixture backup: no database. Covers the timestamps to the
// millisecond, the people and column mapping, the subtask and blocker re-linking, positions, the
// refusals, the idempotent second plan, and the rules imported switched off. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json node --import tsx --test tests/board-import-plan.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backupChecksum, planBoardImport } from '../server/utils/boardImportPlan'
import type { ImportOptions, ImportTarget } from '../server/utils/boardImportPlan'

const T0 = 1_700_000_000_123

/** A small valid backup, checksum included. Callers change it before planning. */
function backup(mutate: (doc: any) => void = () => {}): any {
  const doc: any = {
    format: 'taskmanager-board-backup',
    version: 1,
    exportedAt: '2026-11-08T12:00:00.000Z',
    source: { instance: 'local', boardId: 'src-board', boardName: 'Source board' },
    board: {
      name: 'Source board', description: 'd', status: 'on_track', dashboardWidgets: null, labelColors: {},
      crewRulesOn: true, archived: false, createdAt: T0, updatedAt: T0 + 5, archivedAt: null, fields: []
    },
    columns: [
      { id: 'c-todo', name: 'To do', color: null, position: 0, createdAt: T0, deletedAt: null },
      { id: 'c-done', name: 'Done', color: 'green', position: 1000, createdAt: T0, deletedAt: null }
    ],
    people: [
      { key: 'p1', name: 'Ann Author', email: 'ann@example.test', kind: 'person' },
      { key: 'p2', name: 'Bob Gone', email: null, kind: 'person' }
    ],
    tasks: [
      task({ id: 't-parent', title: 'Parent card', assignee: 'p2', createdBy: 'p1', position: 0, createdAt: T0 + 1, updatedAt: T0 + 2 }),
      task({ id: 't-sub', title: 'Subtask', parentTaskId: 't-parent', position: 0, createdAt: T0 + 3, updatedAt: T0 + 4, blockedBy: ['t-parent'] }),
      task({ id: 't-done', columnId: 'c-done', title: 'Finished', completedAt: T0 + 9, createdAt: T0 + 6, updatedAt: T0 + 9, position: 1000 }),
      task({ id: 't-trashed', columnId: 'c-done', title: 'Gone', createdAt: T0 + 7, updatedAt: T0 + 8, deletedAt: T0 + 8, deletedBy: 'p1', deletedVia: 'mcp', position: 2000 })
    ],
    updates: [
      { id: 'u1', taskId: 't-parent', author: 'p2', body: 'first', visibility: 'internal', replyToId: null, createdAt: T0 + 10, editedAt: T0 + 11, createdVia: 'ui' },
      { id: 'u2', taskId: 't-parent', author: 'p1', body: 'reply', visibility: 'customer', replyToId: 'u1', createdAt: T0 + 12, editedAt: null, createdVia: 'mcp' }
    ],
    activity: [
      { id: 'a1', taskId: 't-parent', actor: 'p1', via: 'ui', kind: 'created', detail: { title: 'Parent card' }, createdAt: T0 + 1 }
    ],
    timeEntries: [
      { id: 'te1', taskId: 't-parent', person: 'p2', minutes: 90, day: '2026-11-08', note: 'work', createdAt: T0 + 13 }
    ],
    statusUpdates: [],
    messages: [],
    rules: [],
    attachments: [],
    counts: {},
    checksum: ''
  }
  mutate(doc)
  doc.counts = {
    columns: doc.columns.length, people: doc.people.length, fields: doc.board.fields.length, tasks: doc.tasks.length,
    updates: doc.updates.length, activity: doc.activity.length, timeEntries: doc.timeEntries.length,
    statusUpdates: doc.statusUpdates.length, messages: doc.messages.length, rules: doc.rules.length, attachments: doc.attachments.length
  }
  doc.checksum = backupChecksum(doc)
  return doc
}

function task(over: Record<string, unknown>): any {
  return {
    columnId: 'c-todo', parentTaskId: null, title: 'Card', description: '<p>body</p>', labels: ['crew'],
    visibility: 'customer', assignee: null, createdBy: null, position: 0, dueOn: '2026-12-01', startOn: null,
    completedAt: null, createdAt: T0, updatedAt: T0, deletedAt: null, deletedBy: null, deletedVia: null,
    previousColumnId: null, trashed: false, fieldValues: [], blockedBy: [], github: [],
    ...over,
    trashed: over.deletedAt != null
  }
}

function target(over: Partial<ImportTarget> = {}): ImportTarget {
  return {
    projectId: 'P-TARGET',
    importer: { userId: 'me', name: 'Me Importer', isOwner: true },
    columns: [
      { id: 'T-todo', name: 'To do', position: 0, deletedAt: null },
      { id: 'T-done', name: 'Done', position: 1000, deletedAt: null }
    ],
    fields: [],
    members: [{ userId: 'ann-user', name: 'Ann', email: 'ann@example.test' }, { userId: 'me', name: 'Me Importer', email: null }],
    tasks: [],
    imports: [],
    ruleCount: 0,
    creating: false,
    ...over
  }
}

function options(over: Partial<ImportOptions> = {}): ImportOptions {
  let n = 0
  return {
    dryRun: false, columnMap: {}, onMissingColumn: 'create', authorMap: {}, idempotencyKey: null, force: false,
    newId: () => `N${++n}`,
    ...over
  }
}

function planOk(input: unknown, opts: ImportOptions, t: ImportTarget) {
  const outcome = planBoardImport(input, opts, t)
  if (!outcome.ok) assert.fail(`refused: ${outcome.message} ${outcome.problems.join(' | ')}`)
  return outcome.plan
}

test('timestamps are kept to the millisecond on cards, updates, activity and time', () => {
  const plan = planOk(backup(), options(), target())
  const parent = plan.tasks.find(row => row.title === 'Parent card')!
  assert.equal(parent.createdAt, T0 + 1)
  assert.equal(parent.updatedAt, T0 + 2)
  const finished = plan.tasks.find(row => row.title === 'Finished')!
  assert.equal(finished.completedAt, T0 + 9)
  const gone = plan.tasks.find(row => row.title === 'Gone')!
  assert.equal(gone.deletedAt, T0 + 8)
  assert.equal(gone.deletedVia, 'mcp')
  const first = plan.updates.find(row => row.body === 'first')!
  assert.equal(first.createdAt, T0 + 10)
  assert.equal(first.editedAt, T0 + 11)
  assert.equal(plan.activity[0]!.createdAt, T0 + 1)
  assert.equal(plan.timeEntries[0]!.createdAt, T0 + 13)
  assert.equal(plan.timeEntries[0]!.day, '2026-11-08')
})

test('an unmapped author becomes the importer, with the original name kept on the update', () => {
  const plan = planOk(backup(), options(), target())
  const bobs = plan.updates.find(row => row.body === 'first')!
  assert.equal(bobs.userId, 'me')
  assert.equal(bobs.authorLabel, 'Bob Gone')
  const anns = plan.updates.find(row => row.body === 'reply')!
  assert.equal(anns.userId, 'ann-user', 'Ann is matched by email to a member')
  assert.equal(anns.authorLabel, null)
})

test('an authorMap entry, by user id or by email, maps the person', () => {
  const byId = planOk(backup(), options({ authorMap: { p2: 'me' } }), target())
  assert.equal(byId.updates.find(row => row.body === 'first')!.userId, 'me')
  assert.equal(byId.updates.find(row => row.body === 'first')!.authorLabel, null)
  const byEmail = planOk(backup(), options({ authorMap: { p2: 'ann@example.test' } }), target())
  assert.equal(byEmail.updates.find(row => row.body === 'first')!.userId, 'ann-user')
})

test('an authorMap entry that is not a member of the board refuses the import', () => {
  const outcome = planBoardImport(backup(), options({ authorMap: { p2: 'stranger' } }), target())
  assert.equal(outcome.ok, false)
})

test('an assignee with no match is left unassigned and kept as a label', () => {
  const plan = planOk(backup(), options(), target())
  const parent = plan.tasks.find(row => row.title === 'Parent card')!
  assert.equal(parent.assigneeId, null)
  assert.ok((parent.tags as string[]).includes('imported-assignee:Bob Gone'))
  assert.equal(plan.report.unmappedPeople.find(row => row.key === 'p2')!.asAssignee, 1)
})

test('subtasks and blockers are re-linked to the new ids, parents first', () => {
  const plan = planOk(backup(), options(), target())
  const parent = plan.tasks.find(row => row.title === 'Parent card')!
  const sub = plan.tasks.find(row => row.title === 'Subtask')!
  assert.equal(sub.parentTaskId, parent.id)
  assert.ok(plan.tasks.indexOf(parent) < plan.tasks.indexOf(sub))
  assert.deepEqual(plan.blockers.map(row => [row.blockedTaskId, row.blockerTaskId]), [[sub.id, parent.id]])
})

test('visibility is kept, and the replies point at the new update ids', () => {
  const plan = planOk(backup(), options(), target())
  assert.equal(plan.tasks.find(row => row.title === 'Parent card')!.visibility, 'customer')
  const first = plan.updates.find(row => row.body === 'first')!
  const reply = plan.updates.find(row => row.body === 'reply')!
  assert.equal(reply.replyToId, first.id)
  assert.equal(reply.visibility, 'customer')
  assert.equal(first.visibility, 'internal')
})

test('cards land below the cards already in their column, in their own order', () => {
  const existing = target({ tasks: [{ id: 'old', columnId: 'T-todo', parentTaskId: null, position: 5000 }] })
  const plan = planOk(backup(), options(), existing)
  const parent = plan.tasks.find(row => row.title === 'Parent card')!
  assert.ok((parent.position as number) > 5000)
})

test('a second import of the same backup creates nothing and skips what is there', () => {
  const doc = backup()
  const first = planOk(doc, options(), target())
  const second = planOk(doc, options(), target({ imports: first.imports.map(row => ({
    kind: row.kind as string, sourceInstance: row.sourceInstance as string, sourceBoardId: row.sourceBoardId as string,
    sourceTaskId: row.sourceTaskId as string, targetId: row.targetId as string, taskId: row.taskId as string | null
  })) }))
  assert.equal(second.tasks.length, 0)
  assert.equal(second.updates.length, 0)
  assert.equal(second.activity.length, 0)
  assert.equal(second.blockers.length, 0)
  assert.equal(second.report.skippedCount, 4)
})

test('a dry run shows the same report the real run writes', () => {
  const doc = backup()
  const real = planOk(doc, options({ dryRun: false }), target())
  const dry = planOk(doc, options({ dryRun: true }), target())
  assert.equal(dry.report.created.tasks, real.report.created.tasks)
  assert.equal(dry.report.dryRun, true)
  assert.equal(real.report.dryRun, false)
})

test('a damaged file is refused, and forced in only when the caller says so', () => {
  const doc = backup()
  doc.tasks[0].title = 'Changed after the checksum'
  assert.equal(planBoardImport(doc, options(), target()).ok, false)
  const forced = planOk(doc, options({ force: true }), target())
  assert.ok(forced.report.warnings.some(text => text.includes('checksum')))
})

test('a file that is not version 1 is refused with the problems listed', () => {
  const outcome = planBoardImport({ format: 'something-else', version: 2 }, options(), target())
  assert.equal(outcome.ok, false)
  if (!outcome.ok) assert.ok(outcome.problems.length > 0)
})

test('a column map to a column that is not on the board refuses the import', () => {
  const outcome = planBoardImport(backup(), options({ columnMap: { 'To do': 'Nowhere' } }), target())
  assert.equal(outcome.ok, false)
})

test('a column map by name or id is used, and an unmatched column is created at the end', () => {
  const plan = planOk(backup(), options({ columnMap: { Done: 'T-todo' } }), target())
  const done = plan.report.matchedColumns.find(row => row.backup === 'Done')!
  assert.equal(done.target, 'To do')
  assert.equal(done.how, 'columnMap')
  const created = planOk(backup(), options(), target({ columns: [{ id: 'T-todo', name: 'To do', position: 0, deletedAt: null }] }))
  assert.deepEqual(created.report.createdColumns.map(row => row.name), ['Done'])
  assert.equal(created.columns[0]!.createdAt, T0)
})

test('onMissingColumn fail refuses when a column has no match', () => {
  const outcome = planBoardImport(backup(), options({ onMissingColumn: 'fail' }), target({ columns: [{ id: 'T-todo', name: 'To do', position: 0, deletedAt: null }] }))
  assert.equal(outcome.ok, false)
})

test('angle brackets that are not an element are ordinary text, not markup', () => {
  const doc = backup()
  doc.tasks[0].title = 'GET /api/tasks/<id> is 405'
  doc.checksum = backupChecksum(doc)
  assert.equal(planBoardImport(doc, options(), target()).ok, true)
})

test('a title with markup is refused', () => {
  const doc = backup()
  doc.tasks[0].title = '<script>alert(1)</script>'
  const outcome = planBoardImport(doc, options(), target())
  assert.equal(outcome.ok, false)
})

test('imported rules are stored switched off, and a rule that names a missing column is left out', () => {
  const doc = backup((d) => {
    d.rules = [
      { id: 'r1', name: 'Ship it', enabled: true, trigger: { kind: 'task_moved', columnId: 'c-done' }, conditions: [], actions: [{ kind: 'complete' }], position: 0, createdBy: 'p1', createdAt: T0, updatedAt: T0 + 1 },
      { id: 'r2', name: 'Move', enabled: true, trigger: { kind: 'task_added' }, conditions: [], actions: [{ kind: 'move_to_column', columnId: 'c-gone' }], position: 1, createdBy: null, createdAt: T0, updatedAt: T0 }
    ]
  })
  // r1 names c-done, which maps to the target's Done column: imported, switched off. r2 names a column that is not
  // in the backup, so it is left out with a warning.
  doc.counts = {
    columns: doc.columns.length, people: doc.people.length, fields: 0, tasks: doc.tasks.length, updates: doc.updates.length,
    activity: doc.activity.length, timeEntries: doc.timeEntries.length, statusUpdates: 0, messages: 0, rules: 2, attachments: 0
  }
  doc.checksum = backupChecksum(doc)
  const plan = planOk(doc, options(), target())
  assert.equal(plan.rules.length, 1)
  assert.equal(plan.rules[0]!.enabled, false)
  assert.equal((plan.rules[0]!.trigger as any).columnId, 'T-done')
  assert.equal(plan.report.created.rules, 1)
  assert.ok(plan.report.warnings.some(text => text.includes('"Move"')))
})

test('a board that is created by the import keeps the backup board settings', () => {
  const plan = planOk(backup(), options(), target({ creating: true, columns: [], members: [], tasks: [] }))
  assert.equal(plan.creating, true)
  assert.equal(plan.board!.createdAt, T0)
  assert.equal(plan.board!.updatedAt, T0 + 5)
  assert.equal(plan.columns.length, 2)
})
