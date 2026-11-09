// The board backup format (version 1): its validator, its canonical JSON and its JSON Schema. Pure: no database.
/* eslint-disable @typescript-eslint/no-explicit-any -- the sample is edited loosely: each test changes the one field it names */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BACKUP_COUNT_SECTIONS, BACKUP_FORMAT, BACKUP_VERSION, BOARD_BACKUP_JSON_SCHEMA, MAX_REPORTED_PROBLEMS,
  canonicalJson, validateBoardBackup
} from '../shared/backup/schema'

const HASH = 'sha256:' + 'a'.repeat(64)

// A small document that is valid in every respect: one column, one person, one task with an update,
// a field value, a blocker, a GitHub link, a time entry, a status update, a message and an attachment.
function sample(): Record<string, any> {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: '2026-11-08T12:00:00.000Z',
    source: { instance: 'local', boardId: 'b1', boardName: 'Board one' },
    board: {
      name: 'Board one', description: 'd', status: 'on_track', dashboardWidgets: null, labelColors: { bug: '#f00' },
      crewRulesOn: true, archived: false, createdAt: 1000, updatedAt: 2000, archivedAt: null,
      fields: [{ id: 'f1', name: 'Priority', type: 'select', options: [{ id: 'o1', label: 'High', color: 'red' }], position: 0, createdAt: 1000 }]
    },
    columns: [{ id: 'c1', name: 'To do', color: null, position: 0, createdAt: 1000, deletedAt: null }],
    people: [{ key: 'p1', name: 'Wick Worker', email: null, kind: 'crew' }],
    tasks: [
      {
        id: 't1', columnId: 'c1', parentTaskId: null, title: 'Card', description: '<p>x</p>', labels: ['crew'],
        visibility: 'internal', assignee: 'p1', createdBy: 'p1', position: 0, dueOn: '2026-12-01', startOn: null,
        completedAt: null, createdAt: 1000, updatedAt: 2000, deletedAt: null, deletedBy: null, deletedVia: null,
        previousColumnId: null, trashed: false, fieldValues: [{ fieldId: 'f1', value: 'o1' }], blockedBy: [],
        github: [{ id: 'g1', kind: 'pull', owner: 'o', repo: 'r', ref: '12', url: 'https://github.com/o/r/pull/12', visibility: 'internal', createdAt: 1000 }]
      },
      {
        id: 't2', columnId: 'c1', parentTaskId: 't1', title: 'Sub', description: '', labels: [],
        visibility: 'customer', assignee: null, createdBy: null, position: 1, dueOn: null, startOn: null,
        completedAt: 1500, createdAt: 1100, updatedAt: 1500, deletedAt: 1600, deletedBy: 'p1', deletedVia: 'mcp',
        previousColumnId: 'c1', trashed: true, fieldValues: [], blockedBy: ['t1'], github: []
      }
    ],
    updates: [{ id: 'u1', taskId: 't1', author: 'p1', body: 'hi', visibility: 'customer', replyToId: null, createdAt: 1200, editedAt: null, createdVia: 'mcp' }],
    activity: [{ id: 'a1', taskId: 't1', actor: 'p1', via: 'ui', kind: 'created', detail: { title: 'Card' }, createdAt: 1000 }],
    timeEntries: [{ id: 'te1', taskId: 't1', person: 'p1', minutes: 90, day: '2026-11-08', note: '', createdAt: 1300 }],
    statusUpdates: [{ id: 's1', status: 'at_risk', body: 'late', person: 'p1', createdAt: 1400 }],
    messages: [
      { id: 'm1', parentId: null, title: 'Hello', body: 'b', person: 'p1', createdAt: 1000 },
      { id: 'm2', parentId: 'm1', title: '', body: 'reply', person: 'p1', createdAt: 1001 }
    ],
    rules: [{
      id: 'r1', name: 'Done rule', enabled: true, trigger: { kind: 'moved' }, conditions: [], actions: [{ kind: 'complete' }],
      position: 0, createdBy: 'p1', createdAt: 1000, updatedAt: 1000
    }],
    attachments: [{ id: 'abc123.png', taskId: 't1', filename: 'abc123.png', contentType: 'image/png', size: 10, sha256: 'b'.repeat(64) }],
    counts: { columns: 1, people: 1, fields: 1, tasks: 2, updates: 1, activity: 1, timeEntries: 1, statusUpdates: 1, messages: 2, rules: 1, attachments: 1 },
    checksum: HASH
  }
}

test('a complete document validates and comes back unchanged', () => {
  const doc = sample()
  const result = validateBoardBackup(doc)
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.backup, doc)
})

test('the format name and version are fixed', () => {
  assert.equal(BACKUP_FORMAT, 'taskmanager-board-backup')
  assert.equal(BACKUP_VERSION, 1)
})

test('a document that is not an object is refused with one problem', () => {
  const result = validateBoardBackup(['not', 'an', 'object'])
  assert.equal(result.ok, false)
  if (!result.ok) assert.deepEqual(result.problems.map(p => p.path), ['$'])
})

test('a wrong format name or version is refused', () => {
  const doc = sample()
  doc.format = 'something-else'
  doc.version = 2
  const result = validateBoardBackup(doc)
  assert.equal(result.ok, false)
  if (!result.ok) assert.deepEqual(result.problems.map(p => p.path).sort(), ['format', 'version'])
})

test('a dangling reference is refused: an assignee, a column, a blocker and an update author must exist', () => {
  const doc = sample()
  doc.tasks[0].assignee = 'nobody'
  doc.tasks[0].columnId = 'gone'
  doc.tasks[1].blockedBy = ['t404']
  doc.updates[0].author = 'ghost'
  const result = validateBoardBackup(doc)
  assert.equal(result.ok, false)
  if (!result.ok) {
    const paths = result.problems.map(p => p.path)
    for (const path of ['tasks[0].assignee', 'tasks[0].columnId', 'tasks[1].blockedBy[0]', 'updates[0].author']) {
      assert.ok(paths.includes(path), `missing problem for ${path}: ${paths.join(', ')}`)
    }
  }
})

test('a field value must name a field of the board', () => {
  const doc = sample()
  doc.tasks[0].fieldValues = [{ fieldId: 'f-unknown', value: 'x' }]
  const result = validateBoardBackup(doc)
  assert.equal(result.ok, false)
  if (!result.ok) assert.ok(result.problems.some(p => p.path === 'tasks[0].fieldValues[0].fieldId'))
})

test('counts must match the sections they describe', () => {
  const doc = sample()
  doc.counts.tasks = 5
  const result = validateBoardBackup(doc)
  assert.equal(result.ok, false)
  if (!result.ok) assert.deepEqual(result.problems.map(p => p.path), ['counts.tasks'])
})

test('a trashed flag must agree with deletedAt', () => {
  const doc = sample()
  doc.tasks[1].trashed = false
  const result = validateBoardBackup(doc)
  assert.equal(result.ok, false)
  if (!result.ok) assert.deepEqual(result.problems.map(p => p.path), ['tasks[1].trashed'])
})

test('a time entry needs a day in YYYY-MM-DD form and whole minutes', () => {
  const doc = sample()
  doc.timeEntries[0].day = '08/11/2026'
  doc.timeEntries[0].minutes = 1.5
  const result = validateBoardBackup(doc)
  assert.equal(result.ok, false)
  if (!result.ok) assert.deepEqual(result.problems.map(p => p.path).sort(), ['timeEntries[0].day', 'timeEntries[0].minutes'])
})

test('timestamps must be whole milliseconds and empty ones null', () => {
  const doc = sample()
  doc.tasks[0].createdAt = '2026-11-08'
  doc.tasks[0].completedAt = undefined
  const result = validateBoardBackup(doc)
  assert.equal(result.ok, false)
  if (!result.ok) assert.deepEqual(result.problems.map(p => p.path).sort(), ['tasks[0].completedAt', 'tasks[0].createdAt'])
})

test('a kind of person, a visibility or a GitHub kind outside its list is refused', () => {
  const doc = sample()
  doc.people[0].kind = 'robot'
  doc.tasks[0].visibility = 'public'
  doc.tasks[0].github[0].kind = 'discussion'
  const result = validateBoardBackup(doc)
  assert.equal(result.ok, false)
  if (!result.ok) {
    const paths = result.problems.map(p => p.path)
    assert.ok(paths.includes('people[0].kind'))
    assert.ok(paths.includes('tasks[0].visibility'))
    assert.ok(paths.includes('tasks[0].github[0].kind'))
  }
})

test('a checksum that is not sha256 plus 64 hex digits is refused', () => {
  const doc = sample()
  doc.checksum = 'md5:abc'
  const result = validateBoardBackup(doc)
  assert.equal(result.ok, false)
  if (!result.ok) assert.deepEqual(result.problems.map(p => p.path), ['checksum'])
})

test('a report lists at most MAX_REPORTED_PROBLEMS problems and counts the rest', () => {
  const doc = sample()
  doc.tasks = Array.from({ length: 30 }, (_, i) => ({ ...doc.tasks[0], id: `x${i}`, assignee: 'nobody', columnId: 'c1', parentTaskId: null, blockedBy: [], fieldValues: [] }))
  doc.counts.tasks = 30
  doc.updates = []
  doc.counts.updates = 0
  doc.timeEntries = []
  doc.counts.timeEntries = 0
  doc.attachments = []
  doc.counts.attachments = 0
  const result = validateBoardBackup(doc)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(MAX_REPORTED_PROBLEMS, 20)
    assert.equal(result.problems.length, 20)
    assert.equal(result.totalProblems, 30)
  }
})

test('canonical JSON ignores key order and leaves the top-level checksum out', () => {
  const a = { b: 1, a: { y: [1, { d: 2, c: 3 }], x: null }, checksum: 'one' }
  const b = { checksum: 'two', a: { x: null, y: [1, { c: 3, d: 2 }] }, b: 1 }
  assert.equal(canonicalJson(a), canonicalJson(b))
  assert.equal(canonicalJson(a), '{"a":{"x":null,"y":[1,{"c":3,"d":2}]},"b":1}')
})

test('canonical JSON keeps array order, so a changed row changes the checksum input', () => {
  assert.notEqual(canonicalJson({ rows: [1, 2] }), canonicalJson({ rows: [2, 1] }))
})

test('the JSON Schema names every section and every count', () => {
  const schema = BOARD_BACKUP_JSON_SCHEMA as any
  assert.equal(schema.properties.format.const, BACKUP_FORMAT)
  assert.equal(schema.properties.version.const, BACKUP_VERSION)
  assert.deepEqual([...schema.properties.counts.required].sort(), [...BACKUP_COUNT_SECTIONS].sort())
  for (const name of ['task', 'update', 'column', 'person', 'field', 'timeEntry', 'attachment']) {
    assert.ok(schema.$defs[name], `missing $defs.${name}`)
  }
  for (const section of ['columns', 'people', 'tasks', 'updates', 'activity', 'timeEntries', 'statusUpdates', 'messages', 'rules', 'attachments']) {
    assert.ok(schema.required.includes(section), `required lacks ${section}`)
  }
})
