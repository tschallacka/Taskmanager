// The board backup, format "taskmanager-board-backup", version 1. A backup is one JSON document that
// `GET /api/projects/:id/backup` streams and that the import (`POST /api/projects/:id/import`) reads back.
// This file is the contract between the two: the TypeScript types, the JSON Schema that describes the
// same shape for people and tools outside this code, and a validator that checks a parsed document
// against it. It is pure data and runs in the browser and on the server alike, so it imports nothing.
//
// Conventions: every id is the database id as stored; every timestamp is epoch milliseconds exactly as
// stored (null when the column is empty); a person is a backup-local `key` (never a user id); the
// checksum covers everything in the document except `checksum` itself (see `canonicalJson`).

export const BACKUP_FORMAT = 'taskmanager-board-backup' as const
export const BACKUP_VERSION = 1 as const

export const PERSON_KINDS = ['person', 'agent', 'crew'] as const
export type PersonKind = typeof PERSON_KINDS[number]

export const BACKUP_VISIBILITIES = ['internal', 'customer'] as const
export const BACKUP_FIELD_TYPES = ['text', 'number', 'select', 'date'] as const
export const BACKUP_GITHUB_KINDS = ['issue', 'pull', 'branch', 'workflow_run'] as const
/** `agent` replaces `mcp` and `ai` in a file that is not an admin's: the key and the crew behind the change are not named. */
export const BACKUP_ACTIVITY_VIA = ['ui', 'mcp', 'ai', 'github', 'agent'] as const
export const BACKUP_DELETION_VIA = ['ui', 'mcp', 'ai'] as const

/** The sections that hold countable rows, in the order `counts` lists them. */
export const BACKUP_COUNT_SECTIONS = [
  'columns', 'people', 'fields', 'tasks', 'updates', 'activity', 'timeEntries',
  'statusUpdates', 'messages', 'rules', 'attachments'
] as const
export type BackupCountSection = typeof BACKUP_COUNT_SECTIONS[number]

/** A reference to a person elsewhere in the document. */
export type PersonKey = string

export interface BackupSource {
  /** Where the export ran: the instance's public host name, or `local` for a dev copy. */
  instance: string
  boardId: string
  boardName: string
}

export interface BackupOption {
  id: string
  label: string
  color: string
}

export interface BackupField {
  id: string
  name: string
  type: typeof BACKUP_FIELD_TYPES[number]
  options: BackupOption[]
  position: number
  createdAt: number
}

export interface BackupBoard {
  name: string
  description: string
  status: string | null
  dashboardWidgets: string[] | null
  labelColors: Record<string, string>
  crewRulesOn: boolean
  archived: boolean
  createdAt: number
  updatedAt: number
  archivedAt: number | null
  /** Custom field definitions of the board. Values are on the tasks. */
  fields: BackupField[]
}

export interface BackupColumn {
  id: string
  name: string
  color: string | null
  position: number
  createdAt: number
  deletedAt: number | null
}

/**
 * A person in the file. An admin's file gives name, email and kind. Any other file gives only the key and
 * the person's mention tag (`@person-3`), which is what the text of that file uses for them.
 */
export interface BackupPerson {
  key: string
  name?: string
  /** The address, in an admin's file only where the owner allows it; otherwise null. */
  email?: string | null
  kind?: PersonKind
  tag?: string
}

export interface BackupGithubLink {
  id: string
  kind: typeof BACKUP_GITHUB_KINDS[number]
  owner: string
  repo: string
  ref: string
  url: string
  visibility: typeof BACKUP_VISIBILITIES[number]
  createdAt: number
}

export interface BackupFieldValue {
  fieldId: string
  value: string
}

export interface BackupTask {
  id: string
  columnId: string
  /** The parent card when this is a subtask and the parent is in the backup, otherwise null. */
  parentTaskId: string | null
  title: string
  /** Stored description as it is in the database (rich text HTML). */
  description: string
  /** The card's labels (the `tags` column). */
  labels: string[]
  visibility: typeof BACKUP_VISIBILITIES[number]
  assignee: PersonKey | null
  createdBy: PersonKey | null
  position: number
  dueOn: string | null
  startOn: string | null
  completedAt: number | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  deletedBy: PersonKey | null
  deletedVia: typeof BACKUP_DELETION_VIA[number] | null
  previousColumnId: string | null
  /** True when the card is in the board's trash at export time. */
  trashed: boolean
  fieldValues: BackupFieldValue[]
  /** Ids of the tasks that block this one, limited to tasks in the same backup. */
  blockedBy: string[]
  github: BackupGithubLink[]
}

export interface BackupUpdate {
  id: string
  taskId: string
  author: PersonKey
  body: string
  visibility: typeof BACKUP_VISIBILITIES[number]
  replyToId: string | null
  createdAt: number
  editedAt: number | null
  createdVia: typeof BACKUP_ACTIVITY_VIA[number]
}

export interface BackupActivity {
  id: string
  taskId: string
  actor: PersonKey | null
  via: typeof BACKUP_ACTIVITY_VIA[number]
  kind: string
  detail: Record<string, string | null>
  createdAt: number
}

export interface BackupTimeEntry {
  id: string
  taskId: string
  person: PersonKey
  minutes: number
  /** `YYYY-MM-DD`, the day the work was done. */
  day: string
  note: string
  createdAt: number
}

export interface BackupStatusUpdate {
  id: string
  status: string
  body: string
  person: PersonKey
  createdAt: number
}

export interface BackupMessage {
  id: string
  parentId: string | null
  title: string
  body: string
  person: PersonKey
  createdAt: number
}

/** A rule is data: an import stores it switched off. */
export interface BackupRule {
  id: string
  name: string
  enabled: boolean
  trigger: unknown
  conditions: unknown[]
  actions: unknown[]
  position: number
  createdBy: PersonKey | null
  createdAt: number
  updatedAt: number
}

export interface BackupAttachment {
  /** The stored file name, which is also how the file is found under the task. */
  id: string
  taskId: string
  filename: string
  contentType: string
  size: number
  sha256: string
  /** Base64 bytes, only when the export was asked for `attachments=inline`. */
  data?: string
}

export interface BoardBackup {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  /** Who the file was made for: `staff` (team members, admins and team keys) or `customer` (contacts, guests, crew keys). Absent in files made before it. */
  audience?: 'staff' | 'customer'
  /** True only in a board admin's staff file, which holds addresses, time logs, rules and the identity behind changes. Absent in files made before it. */
  includesSensitive?: boolean
  exportedAt: string
  source: BackupSource
  board: BackupBoard
  columns: BackupColumn[]
  people: BackupPerson[]
  tasks: BackupTask[]
  updates: BackupUpdate[]
  activity: BackupActivity[]
  timeEntries: BackupTimeEntry[]
  statusUpdates: BackupStatusUpdate[]
  messages: BackupMessage[]
  rules: BackupRule[]
  attachments: BackupAttachment[]
  counts: Record<BackupCountSection, number>
  /** `sha256:<hex>` over `canonicalJson` of the document without this field. */
  checksum: string
}

// ─── Canonical JSON ───────────────────────────────────────────────────────────

/**
 * The text a checksum is computed over: object keys sorted at every level, no whitespace, arrays in
 * their order, and the `checksum` key left out of the top level. Two documents with the same content
 * give the same text, whatever order their keys were written in.
 */
export function canonicalJson(doc: Record<string, unknown>): string {
  return stringify(doc, true)
}

/** The canonical text of one value (a row, a section): the export streams sections with it, row by row. */
export function canonicalValue(value: unknown): string {
  return stringify(value, false)
}

function stringify(value: unknown, top: boolean): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(item => stringify(item, false)).join(',')}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).filter(key => !(top && key === 'checksum')).sort()
  return `{${keys.map(key => `${JSON.stringify(key)}:${stringify(record[key], false)}`).join(',')}}`
}

// ─── JSON Schema ──────────────────────────────────────────────────────────────

const nullable = (type: string) => ({ type: [type, 'null'] })
const timestamp = { type: 'integer', minimum: 0 }
const nullableTimestamp = { type: ['integer', 'null'], minimum: 0 }
const id = { type: 'string', minLength: 1, maxLength: 200 }
const nullableId = { type: ['string', 'null'], minLength: 1, maxLength: 200 }
const text = { type: 'string', maxLength: 1_000_000 }
const shortText = { type: 'string', maxLength: 500 }
const visibility = { enum: [...BACKUP_VISIBILITIES] }

/**
 * JSON Schema (draft 2020-12) for a board backup, version 1. The validator below checks the same shape
 * and the references between sections, which a JSON Schema cannot express on its own.
 */
export const BOARD_BACKUP_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://taskmanager.tschallacka.dev/schemas/board-backup/1.json',
  title: 'Taskmanager board backup, version 1',
  type: 'object',
  required: ['format', 'version', 'exportedAt', 'source', 'board', 'columns', 'people', 'tasks', 'updates', 'activity',
    'timeEntries', 'statusUpdates', 'messages', 'rules', 'attachments', 'counts', 'checksum'],
  properties: {
    format: { const: BACKUP_FORMAT },
    version: { const: BACKUP_VERSION },
    audience: { enum: ['staff', 'customer'] },
    includesSensitive: { type: 'boolean' },
    exportedAt: { type: 'string', format: 'date-time' },
    source: {
      type: 'object',
      required: ['instance', 'boardId', 'boardName'],
      properties: { instance: shortText, boardId: id, boardName: shortText }
    },
    board: {
      type: 'object',
      required: ['name', 'description', 'status', 'dashboardWidgets', 'labelColors', 'crewRulesOn', 'archived', 'createdAt', 'updatedAt', 'archivedAt', 'fields'],
      properties: {
        name: shortText,
        description: text,
        status: nullable('string'),
        dashboardWidgets: { type: ['array', 'null'], items: shortText },
        labelColors: { type: 'object', additionalProperties: shortText },
        crewRulesOn: { type: 'boolean' },
        archived: { type: 'boolean' },
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: nullableTimestamp,
        fields: { type: 'array', items: { $ref: '#/$defs/field' } }
      }
    },
    columns: { type: 'array', items: { $ref: '#/$defs/column' } },
    people: { type: 'array', items: { $ref: '#/$defs/person' } },
    tasks: { type: 'array', items: { $ref: '#/$defs/task' } },
    updates: { type: 'array', items: { $ref: '#/$defs/update' } },
    activity: { type: 'array', items: { $ref: '#/$defs/activity' } },
    timeEntries: { type: 'array', items: { $ref: '#/$defs/timeEntry' } },
    statusUpdates: { type: 'array', items: { $ref: '#/$defs/statusUpdate' } },
    messages: { type: 'array', items: { $ref: '#/$defs/message' } },
    rules: { type: 'array', items: { $ref: '#/$defs/rule' } },
    attachments: { type: 'array', items: { $ref: '#/$defs/attachment' } },
    counts: {
      type: 'object',
      required: [...BACKUP_COUNT_SECTIONS],
      properties: Object.fromEntries(BACKUP_COUNT_SECTIONS.map(name => [name, { type: 'integer', minimum: 0 }]))
    },
    checksum: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' }
  },
  $defs: {
    field: {
      type: 'object',
      required: ['id', 'name', 'type', 'options', 'position', 'createdAt'],
      properties: {
        id, name: shortText, type: { enum: [...BACKUP_FIELD_TYPES] },
        options: { type: 'array', items: { type: 'object', required: ['id', 'label', 'color'], properties: { id, label: shortText, color: shortText } } },
        position: { type: 'integer' }, createdAt: timestamp
      }
    },
    column: {
      type: 'object',
      required: ['id', 'name', 'color', 'position', 'createdAt', 'deletedAt'],
      properties: { id, name: shortText, color: nullable('string'), position: { type: 'integer' }, createdAt: timestamp, deletedAt: nullableTimestamp }
    },
    person: {
      type: 'object',
      required: ['key'],
      properties: { key: id, name: shortText, email: nullable('string'), kind: { enum: [...PERSON_KINDS] }, tag: shortText }
    },
    task: {
      type: 'object',
      required: ['id', 'columnId', 'parentTaskId', 'title', 'description', 'labels', 'visibility', 'assignee', 'createdBy', 'position',
        'dueOn', 'startOn', 'completedAt', 'createdAt', 'updatedAt', 'deletedAt', 'deletedBy', 'deletedVia', 'previousColumnId',
        'trashed', 'fieldValues', 'blockedBy', 'github'],
      properties: {
        id, columnId: id, parentTaskId: nullableId, title: shortText, description: text,
        labels: { type: 'array', items: shortText }, visibility,
        assignee: nullableId, createdBy: nullableId, position: { type: 'integer' },
        dueOn: nullable('string'), startOn: nullable('string'),
        completedAt: nullableTimestamp, createdAt: timestamp, updatedAt: timestamp,
        deletedAt: nullableTimestamp, deletedBy: nullableId, deletedVia: { enum: [...BACKUP_DELETION_VIA, null] },
        previousColumnId: nullableId, trashed: { type: 'boolean' },
        fieldValues: { type: 'array', items: { type: 'object', required: ['fieldId', 'value'], properties: { fieldId: id, value: text } } },
        blockedBy: { type: 'array', items: id },
        github: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'kind', 'owner', 'repo', 'ref', 'url', 'visibility', 'createdAt'],
            properties: { id, kind: { enum: [...BACKUP_GITHUB_KINDS] }, owner: shortText, repo: shortText, ref: shortText, url: shortText, visibility, createdAt: timestamp }
          }
        }
      }
    },
    update: {
      type: 'object',
      required: ['id', 'taskId', 'author', 'body', 'visibility', 'replyToId', 'createdAt', 'editedAt', 'createdVia'],
      properties: {
        id, taskId: id, author: id, body: text, visibility, replyToId: nullableId,
        createdAt: timestamp, editedAt: nullableTimestamp, createdVia: { enum: [...BACKUP_ACTIVITY_VIA] }
      }
    },
    activity: {
      type: 'object',
      required: ['id', 'taskId', 'actor', 'via', 'kind', 'detail', 'createdAt'],
      properties: {
        id, taskId: id, actor: nullableId, via: { enum: [...BACKUP_ACTIVITY_VIA] }, kind: shortText,
        detail: { type: 'object', additionalProperties: { type: ['string', 'null'] } }, createdAt: timestamp
      }
    },
    timeEntry: {
      type: 'object',
      required: ['id', 'taskId', 'person', 'minutes', 'day', 'note', 'createdAt'],
      properties: {
        id, taskId: id, person: id, minutes: { type: 'integer', minimum: 0 },
        day: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, note: text, createdAt: timestamp
      }
    },
    statusUpdate: {
      type: 'object',
      required: ['id', 'status', 'body', 'person', 'createdAt'],
      properties: { id, status: shortText, body: text, person: id, createdAt: timestamp }
    },
    message: {
      type: 'object',
      required: ['id', 'parentId', 'title', 'body', 'person', 'createdAt'],
      properties: { id, parentId: nullableId, title: shortText, body: text, person: id, createdAt: timestamp }
    },
    rule: {
      type: 'object',
      required: ['id', 'name', 'enabled', 'trigger', 'conditions', 'actions', 'position', 'createdBy', 'createdAt', 'updatedAt'],
      properties: {
        id, name: shortText, enabled: { type: 'boolean' }, trigger: { type: 'object' },
        conditions: { type: 'array' }, actions: { type: 'array' }, position: { type: 'integer' },
        createdBy: nullableId, createdAt: timestamp, updatedAt: timestamp
      }
    },
    attachment: {
      type: 'object',
      required: ['id', 'taskId', 'filename', 'contentType', 'size', 'sha256'],
      properties: {
        id, taskId: id, filename: shortText, contentType: shortText, size: { type: 'integer', minimum: 0 },
        sha256: { type: 'string', pattern: '^[0-9a-f]{64}$' }, data: { type: 'string' }
      }
    }
  }
} as const

// ─── Validator ────────────────────────────────────────────────────────────────

/** A validation run lists at most this many problems; the rest are counted, not listed. */
export const MAX_REPORTED_PROBLEMS = 20

export interface BackupProblem {
  path: string
  message: string
}

export interface BackupValid {
  ok: true
  backup: BoardBackup
  problems: []
}

export interface BackupInvalid {
  ok: false
  problems: BackupProblem[]
  totalProblems: number
}

export type BackupValidation = BackupValid | BackupInvalid

type Json = Record<string, unknown>

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value)

/**
 * Checks a parsed document against version 1 of the format: shape, types, enums, the references between
 * sections, and the counts. It does not check the checksum (that needs a hash function, see
 * `server/utils/boardBackup.ts`). Problems are collected, not thrown, so a report can show them all.
 */
export function validateBoardBackup(input: unknown): BackupValidation {
  const problems: BackupProblem[] = []
  const fail = (path: string, message: string) => {
    problems.push({ path, message })
  }

  if (!isRecord(input)) {
    fail('$', 'the document is not a JSON object')
    return finish(problems)
  }
  if (input.format !== BACKUP_FORMAT) fail('format', `must be "${BACKUP_FORMAT}"`)
  if (input.version !== BACKUP_VERSION) fail('version', `must be ${BACKUP_VERSION}`)
  if (input.audience !== undefined && input.audience !== 'staff' && input.audience !== 'customer') fail('audience', 'must be "staff" or "customer"')
  if (input.includesSensitive !== undefined && typeof input.includesSensitive !== 'boolean') fail('includesSensitive', 'must be true or false')
  if (typeof input.exportedAt !== 'string' || Number.isNaN(Date.parse(input.exportedAt))) fail('exportedAt', 'must be an ISO date-time')
  if (typeof input.checksum !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(input.checksum)) fail('checksum', 'must be sha256:<64 hex digits>')

  const source = record(input.source, 'source', fail)
  if (source) {
    str(source.instance, 'source.instance', fail)
    str(source.boardId, 'source.boardId', fail)
    str(source.boardName, 'source.boardName', fail)
  }

  const board = record(input.board, 'board', fail)
  if (board) checkBoard(board, fail)

  const columns = list(input.columns, 'columns', fail, (item, path) => checkColumn(item, path, fail))
  const people = list(input.people, 'people', fail, (item, path) => checkPerson(item, path, fail))
  const tasks = list(input.tasks, 'tasks', fail, (item, path) => checkTask(item, path, fail))
  const updates = list(input.updates, 'updates', fail, (item, path) => checkUpdate(item, path, fail))
  list(input.activity, 'activity', fail, (item, path) => checkActivity(item, path, fail))
  const timeEntries = list(input.timeEntries, 'timeEntries', fail, (item, path) => checkTimeEntry(item, path, fail))
  list(input.statusUpdates, 'statusUpdates', fail, (item, path) => checkStatusUpdate(item, path, fail))
  const messages = list(input.messages, 'messages', fail, (item, path) => checkMessage(item, path, fail))
  list(input.rules, 'rules', fail, (item, path) => checkRule(item, path, fail))
  const attachments = list(input.attachments, 'attachments', fail, (item, path) => checkAttachment(item, path, fail))

  // References: every key, column and task id used anywhere must exist in this document.
  const columnIds = new Set(columns.map(column => String(column.id)))
  const personKeys = new Set(people.map(person => String(person.key)))
  const taskIds = new Set(tasks.map(task => String(task.id)))
  const fieldIds = new Set(board ? list(board.fields, 'board.fields', () => {}, () => {}).map(field => String(field.id)) : [])

  tasks.forEach((task, index) => {
    const path = `tasks[${index}]`
    if (!columnIds.has(String(task.columnId))) fail(`${path}.columnId`, 'refers to a column that is not in the backup')
    if (task.parentTaskId != null && !taskIds.has(String(task.parentTaskId))) fail(`${path}.parentTaskId`, 'refers to a task that is not in the backup')
    if (task.assignee != null && !personKeys.has(String(task.assignee))) fail(`${path}.assignee`, 'refers to a person that is not in people')
    if (task.createdBy != null && !personKeys.has(String(task.createdBy))) fail(`${path}.createdBy`, 'refers to a person that is not in people')
    if (task.deletedBy != null && !personKeys.has(String(task.deletedBy))) fail(`${path}.deletedBy`, 'refers to a person that is not in people')
    if (Array.isArray(task.blockedBy)) {
      task.blockedBy.forEach((blocker, at) => {
        if (!taskIds.has(String(blocker))) fail(`${path}.blockedBy[${at}]`, 'refers to a task that is not in the backup')
      })
    }
    if (Array.isArray(task.fieldValues)) {
      task.fieldValues.forEach((value, at) => {
        if (isRecord(value) && !fieldIds.has(String(value.fieldId))) fail(`${path}.fieldValues[${at}].fieldId`, 'refers to a field that is not on the board')
      })
    }
  })
  updates.forEach((update, index) => {
    if (!taskIds.has(String(update.taskId))) fail(`updates[${index}].taskId`, 'refers to a task that is not in the backup')
    if (!personKeys.has(String(update.author))) fail(`updates[${index}].author`, 'refers to a person that is not in people')
  })
  timeEntries.forEach((entry, index) => {
    if (!taskIds.has(String(entry.taskId))) fail(`timeEntries[${index}].taskId`, 'refers to a task that is not in the backup')
    if (!personKeys.has(String(entry.person))) fail(`timeEntries[${index}].person`, 'refers to a person that is not in people')
  })
  messages.forEach((message, index) => {
    if (message.parentId != null && !messages.some(other => other.id === message.parentId)) fail(`messages[${index}].parentId`, 'refers to a message that is not in the backup')
  })
  attachments.forEach((attachment, index) => {
    if (!taskIds.has(String(attachment.taskId))) fail(`attachments[${index}].taskId`, 'refers to a task that is not in the backup')
  })

  // Counts must say what the sections hold.
  const counts = record(input.counts, 'counts', fail)
  if (counts) {
    const sizes: Record<BackupCountSection, number> = {
      columns: columns.length, people: people.length, fields: board && Array.isArray(board.fields) ? board.fields.length : 0,
      tasks: tasks.length, updates: updates.length, activity: asArray(input.activity).length,
      timeEntries: timeEntries.length, statusUpdates: asArray(input.statusUpdates).length,
      messages: messages.length, rules: asArray(input.rules).length, attachments: attachments.length
    }
    for (const name of BACKUP_COUNT_SECTIONS) {
      if (counts[name] !== sizes[name]) fail(`counts.${name}`, `says ${String(counts[name])} but the section holds ${sizes[name]}`)
    }
  }

  return finish(problems, input as unknown as BoardBackup)
}

function finish(problems: BackupProblem[], backup?: BoardBackup): BackupValidation {
  if (problems.length === 0 && backup) return { ok: true, backup, problems: [] }
  return { ok: false, problems: problems.slice(0, MAX_REPORTED_PROBLEMS), totalProblems: problems.length }
}

type Fail = (path: string, message: string) => void

function asArray(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function record(value: unknown, path: string, fail: Fail): Json | null {
  if (isRecord(value)) return value
  fail(path, 'must be an object')
  return null
}

function str(value: unknown, path: string, fail: Fail): value is string {
  if (typeof value === 'string' && value.length > 0) return true
  fail(path, 'must be a non-empty string')
  return false
}

function optionalStr(value: unknown, path: string, fail: Fail, nullable = true): void {
  if (typeof value === 'string') return
  if (value === null && nullable) return
  fail(path, nullable ? 'must be a string or null' : 'must be a string')
}

function int(value: unknown, path: string, fail: Fail, nullable = false): void {
  if (isInt(value) && value >= 0) return
  if (value === null && nullable) return
  fail(path, nullable ? 'must be a whole number of milliseconds or null' : 'must be a whole number of milliseconds')
}

function bool(value: unknown, path: string, fail: Fail): void {
  if (typeof value !== 'boolean') fail(path, 'must be true or false')
}

function oneOf(value: unknown, allowed: readonly (string | null)[], path: string, fail: Fail): void {
  if (!allowed.includes(value as string | null)) fail(path, `must be one of ${allowed.map(v => v === null ? 'null' : `"${v}"`).join(', ')}`)
}

/** Reads a list of records, runs `check` on each one, and returns the records that are objects. */
function list(value: unknown, path: string, fail: Fail, check: (item: Json, path: string) => void): Json[] {
  if (!Array.isArray(value)) {
    fail(path, 'must be an array')
    return []
  }
  const items: Json[] = []
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(item)) {
      fail(itemPath, 'must be an object')
      return
    }
    items.push(item)
    check(item, itemPath)
  })
  return items
}

function checkBoard(board: Json, fail: Fail): void {
  str(board.name, 'board.name', fail)
  if (typeof board.description !== 'string') fail('board.description', 'must be a string')
  optionalStr(board.status, 'board.status', fail)
  if (board.dashboardWidgets !== null && !(Array.isArray(board.dashboardWidgets) && board.dashboardWidgets.every(w => typeof w === 'string'))) {
    fail('board.dashboardWidgets', 'must be an array of strings or null')
  }
  if (!isRecord(board.labelColors)) fail('board.labelColors', 'must be an object')
  bool(board.crewRulesOn, 'board.crewRulesOn', fail)
  bool(board.archived, 'board.archived', fail)
  int(board.createdAt, 'board.createdAt', fail)
  int(board.updatedAt, 'board.updatedAt', fail)
  int(board.archivedAt, 'board.archivedAt', fail, true)
  list(board.fields, 'board.fields', fail, (field, path) => {
    str(field.id, `${path}.id`, fail)
    str(field.name, `${path}.name`, fail)
    oneOf(field.type, [...BACKUP_FIELD_TYPES], `${path}.type`, fail)
    list(field.options, `${path}.options`, fail, (option, at) => {
      str(option.id, `${at}.id`, fail)
      str(option.label, `${at}.label`, fail)
      str(option.color, `${at}.color`, fail)
    })
    if (!isInt(field.position)) fail(`${path}.position`, 'must be a whole number')
    int(field.createdAt, `${path}.createdAt`, fail)
  })
}

function checkColumn(column: Json, path: string, fail: Fail): void {
  str(column.id, `${path}.id`, fail)
  str(column.name, `${path}.name`, fail)
  optionalStr(column.color, `${path}.color`, fail)
  if (!isInt(column.position)) fail(`${path}.position`, 'must be a whole number')
  int(column.createdAt, `${path}.createdAt`, fail)
  int(column.deletedAt, `${path}.deletedAt`, fail, true)
}

function checkPerson(person: Json, path: string, fail: Fail): void {
  str(person.key, `${path}.key`, fail)
  if (person.name !== undefined) str(person.name, `${path}.name`, fail)
  if (person.email !== undefined) optionalStr(person.email, `${path}.email`, fail)
  if (person.kind !== undefined) oneOf(person.kind, [...PERSON_KINDS], `${path}.kind`, fail)
  if (person.tag !== undefined) str(person.tag, `${path}.tag`, fail)
}

function checkTask(task: Json, path: string, fail: Fail): void {
  str(task.id, `${path}.id`, fail)
  str(task.columnId, `${path}.columnId`, fail)
  optionalStr(task.parentTaskId, `${path}.parentTaskId`, fail)
  str(task.title, `${path}.title`, fail)
  if (typeof task.description !== 'string') fail(`${path}.description`, 'must be a string')
  if (!(Array.isArray(task.labels) && task.labels.every(l => typeof l === 'string'))) fail(`${path}.labels`, 'must be an array of strings')
  oneOf(task.visibility, [...BACKUP_VISIBILITIES], `${path}.visibility`, fail)
  optionalStr(task.assignee, `${path}.assignee`, fail)
  optionalStr(task.createdBy, `${path}.createdBy`, fail)
  if (!isInt(task.position)) fail(`${path}.position`, 'must be a whole number')
  optionalStr(task.dueOn, `${path}.dueOn`, fail)
  optionalStr(task.startOn, `${path}.startOn`, fail)
  int(task.completedAt, `${path}.completedAt`, fail, true)
  int(task.createdAt, `${path}.createdAt`, fail)
  int(task.updatedAt, `${path}.updatedAt`, fail)
  int(task.deletedAt, `${path}.deletedAt`, fail, true)
  optionalStr(task.deletedBy, `${path}.deletedBy`, fail)
  oneOf(task.deletedVia, [...BACKUP_DELETION_VIA, null], `${path}.deletedVia`, fail)
  optionalStr(task.previousColumnId, `${path}.previousColumnId`, fail)
  bool(task.trashed, `${path}.trashed`, fail)
  if (task.trashed !== undefined && task.trashed !== (task.deletedAt !== null && task.deletedAt !== undefined)) {
    fail(`${path}.trashed`, 'must agree with deletedAt')
  }
  list(task.fieldValues, `${path}.fieldValues`, fail, (value, at) => {
    str(value.fieldId, `${at}.fieldId`, fail)
    if (typeof value.value !== 'string') fail(`${at}.value`, 'must be a string')
  })
  if (!(Array.isArray(task.blockedBy) && task.blockedBy.every(b => typeof b === 'string'))) fail(`${path}.blockedBy`, 'must be an array of task ids')
  list(task.github, `${path}.github`, fail, (link, at) => {
    str(link.id, `${at}.id`, fail)
    oneOf(link.kind, [...BACKUP_GITHUB_KINDS], `${at}.kind`, fail)
    str(link.owner, `${at}.owner`, fail)
    str(link.repo, `${at}.repo`, fail)
    str(link.ref, `${at}.ref`, fail)
    str(link.url, `${at}.url`, fail)
    oneOf(link.visibility, [...BACKUP_VISIBILITIES], `${at}.visibility`, fail)
    int(link.createdAt, `${at}.createdAt`, fail)
  })
}

function checkUpdate(update: Json, path: string, fail: Fail): void {
  str(update.id, `${path}.id`, fail)
  str(update.taskId, `${path}.taskId`, fail)
  str(update.author, `${path}.author`, fail)
  if (typeof update.body !== 'string') fail(`${path}.body`, 'must be a string')
  oneOf(update.visibility, [...BACKUP_VISIBILITIES], `${path}.visibility`, fail)
  optionalStr(update.replyToId, `${path}.replyToId`, fail)
  int(update.createdAt, `${path}.createdAt`, fail)
  int(update.editedAt, `${path}.editedAt`, fail, true)
  oneOf(update.createdVia, [...BACKUP_ACTIVITY_VIA], `${path}.createdVia`, fail)
}

function checkActivity(row: Json, path: string, fail: Fail): void {
  str(row.id, `${path}.id`, fail)
  str(row.taskId, `${path}.taskId`, fail)
  optionalStr(row.actor, `${path}.actor`, fail)
  oneOf(row.via, [...BACKUP_ACTIVITY_VIA], `${path}.via`, fail)
  str(row.kind, `${path}.kind`, fail)
  if (!isRecord(row.detail)) fail(`${path}.detail`, 'must be an object')
  int(row.createdAt, `${path}.createdAt`, fail)
}

function checkTimeEntry(entry: Json, path: string, fail: Fail): void {
  str(entry.id, `${path}.id`, fail)
  str(entry.taskId, `${path}.taskId`, fail)
  str(entry.person, `${path}.person`, fail)
  if (!isInt(entry.minutes) || entry.minutes < 0) fail(`${path}.minutes`, 'must be a whole number of minutes')
  if (typeof entry.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.day)) fail(`${path}.day`, 'must be YYYY-MM-DD')
  if (typeof entry.note !== 'string') fail(`${path}.note`, 'must be a string')
  int(entry.createdAt, `${path}.createdAt`, fail)
}

function checkStatusUpdate(row: Json, path: string, fail: Fail): void {
  str(row.id, `${path}.id`, fail)
  str(row.status, `${path}.status`, fail)
  if (typeof row.body !== 'string') fail(`${path}.body`, 'must be a string')
  str(row.person, `${path}.person`, fail)
  int(row.createdAt, `${path}.createdAt`, fail)
}

function checkMessage(row: Json, path: string, fail: Fail): void {
  str(row.id, `${path}.id`, fail)
  optionalStr(row.parentId, `${path}.parentId`, fail)
  if (typeof row.title !== 'string') fail(`${path}.title`, 'must be a string')
  if (typeof row.body !== 'string') fail(`${path}.body`, 'must be a string')
  str(row.person, `${path}.person`, fail)
  int(row.createdAt, `${path}.createdAt`, fail)
}

function checkRule(rule: Json, path: string, fail: Fail): void {
  str(rule.id, `${path}.id`, fail)
  str(rule.name, `${path}.name`, fail)
  bool(rule.enabled, `${path}.enabled`, fail)
  if (!isRecord(rule.trigger)) fail(`${path}.trigger`, 'must be an object')
  if (!Array.isArray(rule.conditions)) fail(`${path}.conditions`, 'must be an array')
  if (!Array.isArray(rule.actions)) fail(`${path}.actions`, 'must be an array')
  if (!isInt(rule.position)) fail(`${path}.position`, 'must be a whole number')
  optionalStr(rule.createdBy, `${path}.createdBy`, fail)
  int(rule.createdAt, `${path}.createdAt`, fail)
  int(rule.updatedAt, `${path}.updatedAt`, fail)
}

function checkAttachment(file: Json, path: string, fail: Fail): void {
  str(file.id, `${path}.id`, fail)
  str(file.taskId, `${path}.taskId`, fail)
  str(file.filename, `${path}.filename`, fail)
  str(file.contentType, `${path}.contentType`, fail)
  if (!isInt(file.size) || file.size < 0) fail(`${path}.size`, 'must be a whole number of bytes')
  if (typeof file.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(file.sha256)) fail(`${path}.sha256`, 'must be 64 lowercase hex digits')
  if (file.data !== undefined && typeof file.data !== 'string') fail(`${path}.data`, 'must be base64 text when present')
}
