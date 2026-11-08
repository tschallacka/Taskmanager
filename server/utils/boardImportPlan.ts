// The planning step of a board import: reads a parsed backup (format "taskmanager-board-backup", version 1),
// checks it, maps its columns, fields and people onto the target board, and says what the import would write.
// It writes nothing and touches no database: the caller passes in a snapshot of the target board, and the
// writing step (server/utils/boardImport.ts) carries out the plan. A dry run stops here, so the report a dry
// run shows is the report the real run would write.
import { createHash } from 'node:crypto'
import { canonicalJson, validateBoardBackup } from '../../shared/backup/schema'
import type { BackupProblem, BoardBackup, BackupTask } from '../../shared/backup/schema'
import { validateRule, MAX_RULES_PER_PROJECT } from './ruleSpec'
import type { RuleContext } from './ruleSpec'

/** A column of the target board. */
export interface TargetColumn { id: string, name: string, position: number, deletedAt: number | null }
/** A custom field of the target board. */
export interface TargetField { id: string, name: string, type: string, options: { id: string, label: string, color: string }[] }
/** A person who may be an author, assignee or creator on the target board. */
export interface TargetMember { userId: string, name: string, email: string | null }
/** A task of the target board, with what the position rules need. */
export interface TargetTask { id: string, columnId: string, parentTaskId: string | null, position: number }
/** A row an earlier import wrote to this board (see `board_imports`). */
export interface ExistingImport {
  kind: string
  sourceInstance: string
  sourceBoardId: string
  sourceTaskId: string
  targetId: string
  taskId: string | null
}

/** Everything the planner needs to know about the target board and the caller. Plain values, read by the caller. */
export interface ImportTarget {
  projectId: string
  /** The account the import runs as: it becomes the author of anything whose author cannot be mapped. */
  importer: { userId: string, name: string, isOwner: boolean }
  columns: TargetColumn[]
  fields: TargetField[]
  members: TargetMember[]
  tasks: TargetTask[]
  imports: ExistingImport[]
  /** How many rules the board has already. */
  ruleCount: number
  /** True when the board is created by this import: nothing exists yet. */
  creating: boolean
}

export interface ImportOptions {
  dryRun: boolean
  /** Backup column name (or id) to target column name (or id). */
  columnMap: Record<string, string>
  onMissingColumn: 'create' | 'fail'
  /** Backup person key to a target user id or email address. */
  authorMap: Record<string, string>
  /** The idempotency key. Defaults to the backup's board id and checksum. */
  idempotencyKey: string | null
  /** Accept a backup whose checksum does not match. The route allows this for the instance admin only. */
  force: boolean
  /** Makes ids. The default is the same generator the app uses. */
  newId?: () => string
}

export interface ImportRefusal {
  ok: false
  status: 400 | 422
  message: string
  problems: string[]
}

export interface PlannedRow { [key: string]: unknown }

export interface ImportReport {
  dryRun: boolean
  source: { instance: string, boardId: string, boardName: string, exportedAt: string }
  idempotencyKey: string
  created: Record<'columns' | 'fields' | 'tasks' | 'updates' | 'activity' | 'timeEntries' | 'statusUpdates' | 'messages' | 'rules' | 'blockers' | 'githubLinks' | 'fieldValues', number>
  /** Backup rows that were already on this board from an earlier import, and were left alone. */
  skipped: { kind: string, sourceId: string, title?: string, targetId: string }[]
  skippedCount: number
  matchedColumns: { backup: string, target: string, how: 'columnMap' | 'name' }[]
  createdColumns: { name: string, id: string }[]
  matchedFields: { backup: string, target: string }[]
  createdFields: { name: string, id: string }[]
  /** People whose backup key was mapped to a user of this board. Email addresses are not listed. */
  mappedPeople: { key: string, name: string, userId: string, how: 'authorMap' | 'email' }[]
  /** People with no match: their updates and activity go to the importer, their assignments are left empty. */
  unmappedPeople: { key: string, name: string, asAuthor: number, asAssignee: number }[]
  warnings: string[]
  attachmentsListed: number
  idMap: { tasks: Record<string, string>, columns: Record<string, string>, updates: Record<string, string> }
}

export interface ImportPlan {
  projectId: string
  creating: boolean
  /** The board to create, when the import makes one: the backup's own board settings. */
  board: Record<string, unknown> | null
  columns: PlannedRow[]
  fields: PlannedRow[]
  tasks: PlannedRow[]
  fieldValues: PlannedRow[]
  blockers: PlannedRow[]
  githubLinks: PlannedRow[]
  updates: PlannedRow[]
  activity: PlannedRow[]
  timeEntries: PlannedRow[]
  statusUpdates: PlannedRow[]
  messages: PlannedRow[]
  rules: PlannedRow[]
  /** One row per backup row this import wrote (cards, messages, status updates, rules). */
  imports: PlannedRow[]
  report: ImportReport
}

export type PlanOutcome = { ok: true, plan: ImportPlan } | ImportRefusal

const TITLE_MAX = 500
// A title that carries markup is refused: a script or an HTML element, or a javascript: link, or an event handler.
// Text in angle brackets that is not an element ("GET /api/tasks/<id>") is ordinary text and passes.
const MARKUP = /<\s*\/?\s*(script|style|iframe|object|embed|svg|img|link|meta|a|div|span|p|b|i|u|em|strong|br|body|html)\b[^>]*>?|javascript:|\son[a-z]+\s*=/i

function defaultId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

/** The checksum a backup must carry: sha256 over its canonical JSON, without the checksum itself. */
export function backupChecksum(doc: BoardBackup): string {
  return `sha256:${createHash('sha256').update(canonicalJson(doc as unknown as Record<string, unknown>)).digest('hex')}`
}

/** Puts a list so that every row comes after the row it is a child of (parents first). */
function parentsFirst<T extends { id: string }>(rows: T[], parentOf: (row: T) => string | null): T[] {
  const byId = new Map(rows.map(row => [row.id, row]))
  const out: T[] = []
  const seen = new Set<string>()
  const visit = (row: T) => {
    if (seen.has(row.id)) return
    seen.add(row.id)
    const parent = parentOf(row)
    if (parent && byId.has(parent)) visit(byId.get(parent)!)
    out.push(row)
  }
  rows.forEach(visit)
  return out
}

/** Replaces every string in a JSON value that is a key of `map`. Used for the column ids a rule names. */
function remapStrings(value: unknown, map: Map<string, string>): unknown {
  if (typeof value === 'string') return map.get(value) ?? value
  if (Array.isArray(value)) return value.map(item => remapStrings(item, map))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, remapStrings(v, map)]))
  }
  return value
}

/**
 * Plans the import of one backup into the target board. Refuses (ok: false) when the file is not a valid
 * version 1 backup, is damaged, or the options point at something that is not there; otherwise returns the
 * rows to write and the report.
 */
export function planBoardImport(input: unknown, options: ImportOptions, target: ImportTarget): PlanOutcome {
  const newId = options.newId ?? defaultId
  const checked = validateBoardBackup(input)
  if (!checked.ok) {
    return refuse(422, 'The file is not a board backup of version 1 of the format.', checked.problems.map(formatProblem))
  }
  const backup = checked.backup
  const problems: string[] = []
  const warnings: string[] = []

  if (backupChecksum(backup) !== backup.checksum && !options.force) {
    return refuse(422, 'The file is damaged: its checksum does not match its contents.', [])
  }
  if (backupChecksum(backup) !== backup.checksum) warnings.push('The checksum does not match, and the import went ahead because it was forced.')

  // ── Columns ──
  const liveColumns = target.columns.filter(column => column.deletedAt === null).sort((a, b) => a.position - b.position)
  const columnPlan = new Map<string, string>()
  const columnRows: PlannedRow[] = []
  const matchedColumns: ImportReport['matchedColumns'] = []
  const createdColumns: ImportReport['createdColumns'] = []
  let nextColumnPosition = Math.max(-1000, ...target.columns.map(column => column.position)) + 1000
  for (const column of [...backup.columns].sort((a, b) => a.position - b.position)) {
    const mapped = options.columnMap[column.name] ?? options.columnMap[column.id]
    if (mapped !== undefined) {
      const hit = liveColumns.find(candidate => candidate.id === mapped || candidate.name === mapped)
      if (!hit) {
        problems.push(`columnMap: "${column.name}" is mapped to "${mapped}", which is not a column of this board`)
        continue
      }
      columnPlan.set(column.id, hit.id)
      matchedColumns.push({ backup: column.name, target: hit.name, how: 'columnMap' })
      continue
    }
    const byName = liveColumns.find(candidate => candidate.name === column.name)
    if (byName) {
      columnPlan.set(column.id, byName.id)
      matchedColumns.push({ backup: column.name, target: byName.name, how: 'name' })
      continue
    }
    if (options.onMissingColumn === 'fail') {
      problems.push(`column "${column.name}" has no match on the board and onMissingColumn is fail`)
      continue
    }
    const id = newId()
    columnPlan.set(column.id, id)
    columnRows.push({
      id, projectId: target.projectId, name: column.name, position: nextColumnPosition, color: column.color,
      createdAt: column.createdAt, deletedAt: column.deletedAt, deletedBy: null, deletedVia: null
    })
    createdColumns.push({ name: column.name, id })
    liveColumns.push({ id, name: column.name, position: nextColumnPosition, deletedAt: column.deletedAt })
    nextColumnPosition += 1000
  }

  // ── Custom fields ──
  const fieldPlan = new Map<string, string>()
  const fieldRows: PlannedRow[] = []
  const matchedFields: ImportReport['matchedFields'] = []
  const createdFields: ImportReport['createdFields'] = []
  const fieldsWanted = backup.board.fields
  for (const field of fieldsWanted) {
    const hit = target.fields.find(candidate => candidate.name === field.name && candidate.type === field.type)
    if (hit) {
      fieldPlan.set(field.id, hit.id)
      matchedFields.push({ backup: field.name, target: hit.name })
      continue
    }
    const id = newId()
    fieldPlan.set(field.id, id)
    fieldRows.push({
      id, projectId: target.projectId, name: field.name, type: field.type, options: field.options,
      position: field.position, createdAt: field.createdAt
    })
    createdFields.push({ name: field.name, id })
  }

  // ── People ──
  const personById = new Map(backup.people.map(person => [person.key, person]))
  const memberById = new Map(target.members.map(member => [member.userId, member]))
  const memberByEmail = new Map(target.members.filter(member => member.email).map(member => [member.email!.toLowerCase(), member]))
  for (const key of Object.keys(options.authorMap)) {
    if (!personById.has(key)) warnings.push(`authorMap: the backup has no person "${key}"`)
  }
  const mappedPeople: ImportReport['mappedPeople'] = []
  const personPlan = new Map<string, { userId: string } | null>()
  for (const person of backup.people) {
    const given = options.authorMap[person.key]
    if (given !== undefined) {
      const member = memberById.get(given) ?? memberByEmail.get(given.toLowerCase())
      if (!member) {
        problems.push(`authorMap: "${person.name}" is mapped to something that is not a member of this board`)
        personPlan.set(person.key, null)
        continue
      }
      personPlan.set(person.key, { userId: member.userId })
      mappedPeople.push({ key: person.key, name: person.name, userId: member.userId, how: 'authorMap' })
      continue
    }
    const byEmail = person.email ? memberByEmail.get(person.email.toLowerCase()) : undefined
    if (byEmail) {
      personPlan.set(person.key, { userId: byEmail.userId })
      mappedPeople.push({ key: person.key, name: person.name, userId: byEmail.userId, how: 'email' })
      continue
    }
    personPlan.set(person.key, null)
  }
  const unmapped = new Map<string, { key: string, name: string, asAuthor: number, asAssignee: number }>()
  const noteUnmapped = (key: string | null, role: 'asAuthor' | 'asAssignee') => {
    if (!key) return
    const person = personById.get(key)
    if (!person || personPlan.get(key)) return
    const row = unmapped.get(key) ?? { key, name: person.name, asAuthor: 0, asAssignee: 0 }
    row[role] += 1
    unmapped.set(key, row)
  }
  const authorOf = (key: string, role: 'asAuthor' | 'asAssignee' = 'asAuthor') => {
    const plan = personPlan.get(key)
    noteUnmapped(key, role)
    return plan ?? null
  }
  const importer = target.importer
  const authorLabel = (key: string | null) => {
    if (!key) return null
    return personPlan.get(key) ? null : personById.get(key)?.name ?? null
  }

  // ── Existing imports on this board, from the same source board ──
  const sameSource = (row: ExistingImport) => row.sourceInstance === backup.source.instance && row.sourceBoardId === backup.source.boardId
  const existing = (kind: string) => new Map(target.imports.filter(row => row.kind === kind && sameSource(row)).map(row => [row.sourceTaskId, row]))
  const existingTasks = existing('task')
  const existingMessages = existing('message')
  const existingStatus = existing('status')
  const existingRules = existing('rule')

  // ── Cards ──
  const idMapTasks = new Map<string, string>()
  const skipped: ImportReport['skipped'] = []
  const toCreate: BackupTask[] = []
  for (const task of backup.tasks) {
    const hit = existingTasks.get(task.id)
    if (hit) {
      idMapTasks.set(task.id, hit.targetId)
      skipped.push({ kind: 'task', sourceId: task.id, title: task.title, targetId: hit.targetId })
    } else {
      toCreate.push(task)
    }
  }
  // Positions: a card goes below the cards already in its column (or under its parent), in the order it had.
  const topBase = new Map<string, number>()
  const childBase = new Map<string, number>()
  for (const task of target.tasks) {
    if (task.parentTaskId) childBase.set(task.parentTaskId, Math.max(childBase.get(task.parentTaskId) ?? -1000, task.position))
    else topBase.set(task.columnId, Math.max(topBase.get(task.columnId) ?? -1000, task.position))
  }
  const cardsOrdered = parentsFirst(toCreate, task => task.parentTaskId)
  const rank = new Map<string, number>()
  const taskIds = new Map<string, string>()
  for (const task of cardsOrdered) taskIds.set(task.id, newId())
  for (const task of cardsOrdered) idMapTasks.set(task.id, taskIds.get(task.id)!)
  const sortedForPosition = [...toCreate].sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1))

  const taskRows: PlannedRow[] = []
  const linkedFields: PlannedRow[] = []
  const linkedBlockers: PlannedRow[] = []
  const linkedGithub: PlannedRow[] = []
  const commentRows: PlannedRow[] = []
  const activityRows: PlannedRow[] = []
  const timeRows: PlannedRow[] = []
  const newTaskIds = new Set(toCreate.map(task => task.id))

  const columnOfTask = (task: BackupTask): string | null => {
    const mapped = columnPlan.get(task.columnId)
    if (!mapped) problems.push(`card "${task.title}" is in a column that is not on the board`)
    return mapped ?? null
  }

  // Positions first, so each row knows its place.
  const positionOf = new Map<string, number>()
  for (const task of sortedForPosition) {
    const parentNew = task.parentTaskId && newTaskIds.has(task.parentTaskId)
    const parentExisting = task.parentTaskId && !parentNew ? idMapTasks.get(task.parentTaskId) : undefined
    const groupKey = task.parentTaskId ? `child:${parentNew ? taskIds.get(task.parentTaskId) : parentExisting ?? task.parentTaskId}` : `col:${columnPlan.get(task.columnId) ?? task.columnId}`
    const base = task.parentTaskId
      ? (childBase.get(parentExisting ?? '') ?? -1000)
      : (topBase.get(columnPlan.get(task.columnId) ?? '') ?? -1000)
    const next = (rank.get(groupKey) ?? 0) + 1
    rank.set(groupKey, next)
    positionOf.set(task.id, base + next * 1000)
  }

  for (const task of cardsOrdered) {
    const id = taskIds.get(task.id)!
    const columnId = columnOfTask(task)
    if (!columnId) continue
    if (MARKUP.test(task.title)) problems.push(`card "${task.title.slice(0, 60)}" has markup in its title`)
    const titleText = task.title.trim().slice(0, TITLE_MAX) || 'Untitled'
    const tags = [...task.labels]
    const assigneePlan = task.assignee ? authorOf(task.assignee, 'asAssignee') : null
    const assigneeKey = task.assignee
    if (assigneeKey && !assigneePlan) {
      const name = personById.get(assigneeKey)?.name ?? 'unknown'
      const label = `imported-assignee:${name}`
      if (!tags.includes(label)) tags.push(label)
    }
    const parentId = task.parentTaskId
      ? (newTaskIds.has(task.parentTaskId) ? taskIds.get(task.parentTaskId)! : idMapTasks.get(task.parentTaskId) ?? null)
      : null
    const creator = task.createdBy ? authorOf(task.createdBy) : null
    const deleter = task.deletedBy ? authorOf(task.deletedBy) : null
    taskRows.push({
      id, projectId: target.projectId, columnId, parentTaskId: parentId,
      title: titleText, description: task.description, tags, visibility: task.visibility,
      assigneeId: assigneePlan?.userId ?? null,
      createdBy: creator?.userId ?? importer.userId,
      dueOn: task.dueOn, startOn: task.startOn, completedAt: task.completedAt,
      position: positionOf.get(task.id)!,
      createdAt: task.createdAt, updatedAt: task.updatedAt,
      previousColumnId: task.previousColumnId ? columnPlan.get(task.previousColumnId) ?? null : null,
      deletedAt: task.deletedAt, deletedBy: task.deletedBy ? (deleter?.userId ?? importer.userId) : null,
      deletedVia: task.deletedVia
    })
    for (const value of task.fieldValues) {
      const fieldId = fieldPlan.get(value.fieldId)
      if (!fieldId) continue
      const field = backup.board.fields.find(candidate => candidate.id === value.fieldId)
      if (field?.type === 'select' && !field.options.some(option => option.id === value.value)) {
        warnings.push(`card "${task.title.slice(0, 60)}": the value of "${field.name}" is not one of its options and was left out`)
        continue
      }
      linkedFields.push({ taskId: id, fieldId, value: value.value })
    }
    for (const blockerId of task.blockedBy) {
      const blocker = idMapTasks.get(blockerId)
      if (!blocker) {
        warnings.push(`card "${task.title.slice(0, 60)}" is blocked by a card that is not in the backup; the blocker was left out`)
        continue
      }
      linkedBlockers.push({ id: newId(), blockedTaskId: id, blockerTaskId: blocker, createdBy: importer.userId, createdAt: task.createdAt })
    }
    for (const link of task.github) {
      linkedGithub.push({
        id: newId(), projectId: target.projectId, taskId: id, kind: link.kind, owner: link.owner, repo: link.repo,
        ref: link.ref, url: link.url, visibility: link.visibility, createdBy: null, createdAt: link.createdAt
      })
    }
  }

  // Updates, activity and time: only for cards that are new here. A card that was imported before already has them.
  const updateIds = new Map<string, string>()
  for (const update of backup.updates) {
    if (newTaskIds.has(update.taskId)) updateIds.set(update.id, newId())
  }
  for (const update of backup.updates) {
    const id = updateIds.get(update.id)
    if (!id) continue
    const author = authorOf(update.author)
    commentRows.push({
      id, taskId: taskIds.get(update.taskId)!, userId: author?.userId ?? importer.userId,
      authorLabel: authorLabel(update.author), body: update.body, visibility: update.visibility,
      createdVia: update.createdVia, apiKeyId: null, createdAt: update.createdAt, editedAt: update.editedAt,
      replyToId: update.replyToId ? updateIds.get(update.replyToId) ?? null : null
    })
  }
  for (const row of backup.activity) {
    if (!newTaskIds.has(row.taskId)) continue
    const actor = row.actor ? authorOf(row.actor) : null
    activityRows.push({
      id: newId(), taskId: taskIds.get(row.taskId)!, projectId: target.projectId,
      actorId: row.actor ? (actor?.userId ?? importer.userId) : null,
      authorLabel: authorLabel(row.actor), via: row.via, kind: row.kind, detail: row.detail, createdAt: row.createdAt
    })
  }
  for (const entry of backup.timeEntries) {
    if (!newTaskIds.has(entry.taskId)) continue
    const person = authorOf(entry.person)
    timeRows.push({
      id: newId(), taskId: taskIds.get(entry.taskId)!, projectId: target.projectId, userId: person?.userId ?? importer.userId,
      minutes: entry.minutes, day: entry.day, note: entry.note, createdAt: entry.createdAt
    })
  }

  // Board-level rows: status updates, messages and rules. Each is written once; a second import skips them.
  const statusRows: PlannedRow[] = []
  const imports: PlannedRow[] = []
  const importKey = options.idempotencyKey ?? `${backup.source.boardId}:${backup.checksum}`
  const recordImport = (kind: string, sourceId: string, targetId: string, taskId: string | null) => {
    imports.push({
      id: newId(), projectId: target.projectId, importKey, kind, sourceInstance: backup.source.instance,
      sourceBoardId: backup.source.boardId, sourceTaskId: sourceId, taskId, targetId, importedAt: Date.now()
    })
  }
  for (const task of cardsOrdered) recordImport('task', task.id, taskIds.get(task.id)!, taskIds.get(task.id)!)

  for (const row of backup.statusUpdates) {
    const hit = existingStatus.get(row.id)
    if (hit) {
      skipped.push({ kind: 'status', sourceId: row.id, targetId: hit.targetId })
      continue
    }
    const id = newId()
    const person = authorOf(row.person)
    statusRows.push({ id, projectId: target.projectId, userId: person?.userId ?? importer.userId, status: row.status, body: row.body, createdAt: row.createdAt })
    recordImport('status', row.id, id, null)
  }

  const messageIds = new Map<string, string>()
  const messagesNew = backup.messages.filter((message) => {
    const hit = existingMessages.get(message.id)
    if (hit) {
      messageIds.set(message.id, hit.targetId)
      skipped.push({ kind: 'message', sourceId: message.id, targetId: hit.targetId })
      return false
    }
    messageIds.set(message.id, newId())
    return true
  })
  const messageRows: PlannedRow[] = []
  for (const message of parentsFirst(messagesNew, row => row.parentId)) {
    const id = messageIds.get(message.id)!
    const person = authorOf(message.person)
    messageRows.push({
      id, projectId: target.projectId, parentId: message.parentId ? messageIds.get(message.parentId) ?? null : null,
      userId: person?.userId ?? importer.userId, title: message.title, body: message.body, createdAt: message.createdAt
    })
    recordImport('message', message.id, id, null)
  }

  const ruleRows: PlannedRow[] = []
  const columnIdsAfter = liveColumns.map(column => column.id)
  const ruleContext: RuleContext = {
    columnIds: columnIdsAfter,
    memberIds: target.members.map(member => member.userId),
    mayChangeVisibility: importer.isOwner
  }
  let ruleSlots = MAX_RULES_PER_PROJECT - target.ruleCount
  const remapColumns = new Map<string, string>(columnPlan)
  for (const rule of backup.rules) {
    const hit = existingRules.get(rule.id)
    if (hit) {
      skipped.push({ kind: 'rule', sourceId: rule.id, targetId: hit.targetId })
      continue
    }
    if (ruleSlots <= 0) {
      warnings.push(`rule "${rule.name}" was not imported: the board would have more than ${MAX_RULES_PER_PROJECT} rules`)
      continue
    }
    const remapped = remapStrings({ name: rule.name, enabled: false, trigger: rule.trigger, conditions: rule.conditions, actions: rule.actions }, remapColumns) as Record<string, unknown>
    const checkedRule = validateRule(remapped, ruleContext)
    if (!checkedRule.ok) {
      warnings.push(`rule "${rule.name}" was not imported: ${checkedRule.problems.join('; ')}`)
      continue
    }
    const id = newId()
    ruleSlots -= 1
    const position = target.ruleCount + ruleRows.length
    ruleRows.push({
      id, projectId: target.projectId, name: checkedRule.rule.name || rule.name, enabled: false,
      trigger: checkedRule.rule.trigger, conditions: checkedRule.rule.conditions, actions: checkedRule.rule.actions,
      position, createdBy: importer.userId, createdAt: rule.createdAt, updatedAt: rule.updatedAt
    })
    recordImport('rule', rule.id, id, null)
  }
  if (backup.attachments.length) {
    warnings.push(`${backup.attachments.length} attachment${backup.attachments.length === 1 ? ' was' : 's were'} listed in the backup and not imported: their files are not part of the import yet`)
  }

  if (problems.length) {
    return refuse(400, 'The import cannot be done as it stands. Nothing was written.', problems)
  }

  const created = {
    columns: columnRows.length,
    fields: fieldRows.length,
    tasks: taskRows.length,
    updates: commentRows.length,
    activity: activityRows.length,
    timeEntries: timeRows.length,
    statusUpdates: statusRows.length,
    messages: messageRows.length,
    rules: ruleRows.length,
    blockers: linkedBlockers.length,
    githubLinks: linkedGithub.length,
    fieldValues: linkedFields.length
  }
  const idMapColumns = Object.fromEntries([...columnPlan.entries()])
  const report: ImportReport = {
    dryRun: options.dryRun,
    source: { instance: backup.source.instance, boardId: backup.source.boardId, boardName: backup.source.boardName, exportedAt: backup.exportedAt },
    idempotencyKey: importKey,
    created,
    skipped,
    skippedCount: skipped.length,
    matchedColumns,
    createdColumns,
    matchedFields,
    createdFields,
    mappedPeople,
    unmappedPeople: [...unmapped.values()],
    warnings,
    attachmentsListed: backup.attachments.length,
    idMap: {
      tasks: Object.fromEntries(idMapTasks),
      columns: idMapColumns,
      updates: Object.fromEntries(updateIds)
    }
  }
  return {
    ok: true,
    plan: {
      projectId: target.projectId,
      creating: target.creating,
      board: target.creating ? boardSettingsOf(backup) : null,
      columns: columnRows,
      fields: fieldRows,
      tasks: taskRows,
      fieldValues: linkedFields,
      blockers: linkedBlockers,
      githubLinks: linkedGithub,
      updates: commentRows,
      activity: activityRows,
      timeEntries: timeRows,
      statusUpdates: statusRows,
      messages: messageRows,
      rules: ruleRows,
      imports,
      report
    }
  }
}

function boardSettingsOf(backup: BoardBackup): Record<string, unknown> {
  const board = backup.board
  return {
    name: board.name, description: board.description, status: board.status, dashboardWidgets: board.dashboardWidgets,
    labelColors: board.labelColors, crewRulesOn: board.crewRulesOn, archivedAt: board.archivedAt,
    createdAt: board.createdAt, updatedAt: board.updatedAt
  }
}

function formatProblem(problem: BackupProblem): string {
  return `${problem.path}: ${problem.message}`
}

function refuse(status: 400 | 422, message: string, problems: string[]): ImportRefusal {
  return { ok: false, status, message, problems: problems.slice(0, 20) }
}
