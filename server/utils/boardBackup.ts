import { createHash } from 'node:crypto'
import type { Hash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { and, asc, count, eq, gt, inArray, isNull, notInArray } from 'drizzle-orm'
import { db } from '../db'
import {
  agentAudit, githubLinks, projectColumns, projectFields, projectMessages, projectRules, projectStatusUpdates,
  projectTasks, taskActivity, taskComments, taskDependencies, taskFieldValues, timeEntries, user
} from '../db/schema'
import type { Project } from '../db/schema'
import {
  BACKUP_FORMAT, BACKUP_VERSION, canonicalJson, canonicalValue
} from '../../shared/backup/schema'
import type { BackupCountSection } from '../../shared/backup/schema'
import { ATTACHMENT_MIME, taskAttachmentDir } from './attachments'
import { commentVisibilityFilter, taskVisibilityFilter } from './auth-helpers'
import type { Audience } from './auth-helpers'
import { emailsVisibleTo } from './emailPrivacy'
import { visibleGithubLinks } from './githubAudience'
import { projectPeople } from './people'
import { activityKindsHiddenFrom } from './taskActivity'
import { genId } from './projects'

// The board backup: one JSON document, format "taskmanager-board-backup" version 1 (shared/backup/schema.ts).
// The export is streamed. Rows are read a page at a time and written as they are read, so a board of
// thousands of cards is never built in memory. The sections are written in the order their keys sort in,
// and every object's keys are written sorted, so the text up to the checksum IS the canonical JSON the
// checksum is computed over. That lets the checksum be a running hash, written last.
//
// Who gets what: the caller's audience decides the content, with the same helpers the board, task and
// update routes use. Team staff get the whole board. A customer contact, a guest or a crew key gets only
// the customer-visible cards and comments, with the rules the normal routes apply to them.
//
// What is never written: secrets, API keys, tokens, pairing codes, sessions, push subscriptions,
// password hashes, crew gate state, another person's address, a personal pin.

const PAGE = 500
const MAX_ONLY_IDS = 20_000
/** Downloads one caller may make of one board in an hour. Instance admins are exempt. */
export const BACKUPS_PER_HOUR = 6
const HOUR_MS = 60 * 60 * 1000

/** Backups being written now, by board and caller. One at a time for each pair. */
const running = new Set<string>()

export function backupSlotKey(projectId: string, callerId: string): string {
  return `${projectId}|${callerId}`
}

export function claimBackupSlot(key: string): boolean {
  if (running.has(key)) return false
  running.add(key)
  return true
}

export function releaseBackupSlot(key: string): void {
  running.delete(key)
}

/** The downloads of each caller and board that were made in the last hour, oldest first. */
const recentDownloads = new Map<string, number[]>()

/** Seconds until this caller may download this board again; 0 when it may now. */
export function backupWaitSeconds(callerId: string, projectId: string, now = Date.now()): number {
  const key = backupSlotKey(projectId, callerId)
  const times = (recentDownloads.get(key) ?? []).filter(time => now - time < HOUR_MS)
  recentDownloads.set(key, times)
  if (times.length < BACKUPS_PER_HOUR) return 0
  return Math.max(1, Math.ceil((times[times.length - BACKUPS_PER_HOUR]! + HOUR_MS - now) / 1000))
}

export function recordBackupDownload(callerId: string, projectId: string, now = Date.now()): void {
  const key = backupSlotKey(projectId, callerId)
  const times = (recentDownloads.get(key) ?? []).filter(time => now - time < HOUR_MS)
  times.push(now)
  recentDownloads.set(key, times)
}

export interface BackupRequest {
  project: Pick<Project, 'id' | 'name' | 'description' | 'status' | 'dashboardWidgets' | 'labelColors' | 'crewRulesOn' | 'archivedAt' | 'createdAt' | 'updatedAt' | 'userId' | 'teamId' | 'customerId'>
  /** The person the backup is made for: the session user, or the owner of the API key. */
  viewerId: string
  /** Who is asking, for the one-at-a-time slot and the hourly limit: the key when there is one, else the person. */
  callerId: string
  /** Which door the backup came through, for the audit row. */
  keyId: string | null
  keyName: string
  /** What this caller may read on the board. Decides what the file holds. */
  audience: Audience
  /** Whether the caller is a board admin (see boardAdmin.ts). Only an admin's staff file holds the sensitive material. */
  admin: boolean
  /** Limits the cards to these ids. Board-level sections are left out when a limit is given. */
  only: string[] | null
  /** Limits the cards to the columns with these names. */
  columns: string[] | null
  /** Put the attachment bytes into the file as base64, not just their list. */
  inlineAttachments: boolean
  /** The host name the request came in on, written as the source instance. */
  instance: string
}

interface TaskSelection {
  projectId: string
  only: string[] | null
  columnIds: string[] | null
}

/** A prepared backup: everything that must be known before the board is read (counts, people, the small sections). */
export interface BackupPlan {
  request: BackupRequest
  full: boolean
  selection: TaskSelection
  counts: Record<BackupCountSection, number>
  keys: Map<string, string>
  people: Record<string, unknown>[]
  board: Record<string, unknown>
  columns: Record<string, unknown>[]
  /** Outside an admin's file: each person's name and address, replaced by the person's tag wherever they appear in text. */
  redactions: [string, string][]
  fileName: string
  exportedAt: string
}

/** Parses `?only=` and `?columns=` as lists. Null when the parameter is not there. */
export function parseList(value: unknown, max = MAX_ONLY_IDS): string[] | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const items = [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))]
  if (items.length > max) throw new Error(`at most ${max} items`)
  return items
}

export function backupFileName(boardName: string, now: Date): string {
  const slug = boardName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'board'
  return `${slug}-backup-${now.toISOString().slice(0, 10)}.json`
}

/** The sha256 checksum of a backup: over the canonical JSON of everything except `checksum`. */
export function checksumOf(doc: Record<string, unknown>): string {
  return `sha256:${createHash('sha256').update(canonicalJson(doc)).digest('hex')}`
}

/** Which tasks a backup holds. The same condition is used for counts, people and every section. */
function taskWhere(selection: TaskSelection) {
  return and(
    eq(projectTasks.projectId, selection.projectId),
    selection.only ? inArray(projectTasks.id, selection.only) : undefined,
    selection.columnIds ? inArray(projectTasks.columnId, selection.columnIds) : undefined
  )
}

function taskIdsOf(selection: TaskSelection) {
  return db.select({ id: projectTasks.id }).from(projectTasks).where(taskWhere(selection))
}

/** The comments the caller may read, on the selected tasks. */
function updatesWhere(selection: TaskSelection, audience: Audience) {
  return and(inArray(taskComments.taskId, taskIdsOf(selection)), commentVisibilityFilter(audience))
}

/** The activity the caller may read, on the selected tasks. */
function activityWhere(selection: TaskSelection, audience: Audience) {
  const hidden = activityKindsHiddenFrom(audience === 'customer')
  return and(
    inArray(taskActivity.taskId, taskIdsOf(selection)),
    hidden.length ? notInArray(taskActivity.kind, hidden) : undefined
  )
}

/** Reads the ids of the selected tasks a page at a time, so a large board is never listed at once. */
async function* taskIdPages(selection: TaskSelection) {
  let after: string | null = null
  for (;;) {
    const rows: { id: string }[] = await db.select({ id: projectTasks.id })
      .from(projectTasks)
      .where(and(taskWhere(selection), after ? gt(projectTasks.id, after) : undefined))
      .orderBy(asc(projectTasks.id))
      .limit(PAGE)
    if (rows.length === 0) return
    yield rows.map(row => row.id)
    after = rows[rows.length - 1]!.id
    if (rows.length < PAGE) return
  }
}

function attachmentFiles(taskId: string): string[] {
  const dir = taskAttachmentDir(taskId)
  return existsSync(dir) ? readdirSync(dir).filter(name => !name.startsWith('.')).sort() : []
}

/**
 * How many attachment files the selected cards hold. One listing of the attachments folder says which
 * cards have a folder at all, so a board of thousands of cards does not check thousands of folders.
 */
async function countAttachments(selection: TaskSelection): Promise<number> {
  const root = dirname(taskAttachmentDir('card'))
  if (!existsSync(root)) return 0
  const withFolder = new Set(readdirSync(root))
  let total = 0
  for await (const ids of taskIdPages(selection)) {
    for (const id of ids) {
      if (withFolder.has(id)) total += attachmentFiles(id).length
    }
  }
  return total
}

function contentTypeOf(filename: string): string {
  return ATTACHMENT_MIME[extname(filename).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * The cards a customer-level caller may read: customer-visible, not in the trash, in a live column, and
 * with every parent above them also readable. The board route draws the same cards.
 */
async function customerTaskIds(request: BackupRequest, columnIds: string[]): Promise<string[]> {
  const rows = await db.select({ id: projectTasks.id, parentTaskId: projectTasks.parentTaskId })
    .from(projectTasks)
    .where(and(
      eq(projectTasks.projectId, request.project.id),
      taskVisibilityFilter('customer'),
      isNull(projectTasks.deletedAt),
      inArray(projectTasks.columnId, columnIds),
      request.only ? inArray(projectTasks.id, request.only) : undefined
    ))
  const byId = new Map(rows.map(row => [row.id, row]))
  return rows
    .filter((row) => {
      let current = row
      while (current.parentTaskId) {
        const parent = byId.get(current.parentTaskId)
        if (!parent) return false
        current = parent
      }
      return true
    })
    .map(row => row.id)
}

/**
 * Reads everything a backup needs before the board is read: the counts, the people, the columns and the
 * board. Throws before anything is sent, so a refusal is an HTTP error and not a broken file.
 */
export async function prepareBackup(request: BackupRequest): Promise<BackupPlan> {
  const { project, audience } = request
  const staff = audience === 'staff'
  const full = staff && !request.only && !request.columns
  // The sensitive material (addresses, time logs, rules) is for a board admin's staff file only.
  const sensitive = staff && request.admin

  // Customers see live columns only, as the board route does.
  const columnRows = await db.select().from(projectColumns)
    .where(and(eq(projectColumns.projectId, project.id), staff ? undefined : isNull(projectColumns.deletedAt)))
    .orderBy(asc(projectColumns.position))
  const columnIds = request.columns
    ? columnRows.filter(column => request.columns!.includes(column.name)).map(column => column.id)
    : staff ? null : columnRows.map(column => column.id)

  let selection: TaskSelection = { projectId: project.id, only: request.only, columnIds }
  if (!staff) {
    selection = { projectId: project.id, only: await customerTaskIds(request, columnIds ?? []), columnIds }
  }

  const taskCondition = taskWhere(selection)
  const [taskCount] = await db.select({ n: count() }).from(projectTasks).where(taskCondition)
  const [updateCount] = await db.select({ n: count() }).from(taskComments).where(updatesWhere(selection, audience))
  const [activityCount] = await db.select({ n: count() }).from(taskActivity).where(activityWhere(selection, audience))
  const [timeCount] = sensitive
    ? await db.select({ n: count() }).from(timeEntries).where(inArray(timeEntries.taskId, taskIdsOf(selection)))
    : [{ n: 0 }]
  const attachmentCount = await countAttachments(selection)
  const fieldRows = staff
    ? await db.select().from(projectFields).where(eq(projectFields.projectId, project.id)).orderBy(asc(projectFields.position))
    : []
  const statusCount = full ? (await db.select({ n: count() }).from(projectStatusUpdates).where(eq(projectStatusUpdates.projectId, project.id)))[0]!.n : 0
  const messageCount = full ? (await db.select({ n: count() }).from(projectMessages).where(eq(projectMessages.projectId, project.id)))[0]!.n : 0
  const ruleCount = full && sensitive ? (await db.select({ n: count() }).from(projectRules).where(eq(projectRules.projectId, project.id)))[0]!.n : 0

  // People: every account a row of this backup points at.
  const personIds = new Set<string>()
  const addAll = (rows: { id: string | null }[]) => {
    for (const row of rows) if (row.id) personIds.add(row.id)
  }
  addAll(await db.selectDistinct({ id: projectTasks.assigneeId }).from(projectTasks).where(taskCondition))
  addAll(await db.selectDistinct({ id: projectTasks.createdBy }).from(projectTasks).where(taskCondition))
  addAll(await db.selectDistinct({ id: projectTasks.deletedBy }).from(projectTasks).where(taskCondition))
  addAll(await db.selectDistinct({ id: taskComments.userId }).from(taskComments).where(updatesWhere(selection, audience)))
  addAll(await db.selectDistinct({ id: taskActivity.actorId }).from(taskActivity).where(activityWhere(selection, audience)))
  if (sensitive) addAll(await db.selectDistinct({ id: timeEntries.userId }).from(timeEntries).where(inArray(timeEntries.taskId, taskIdsOf(selection))))
  if (full) {
    addAll(await db.selectDistinct({ id: projectStatusUpdates.userId }).from(projectStatusUpdates).where(eq(projectStatusUpdates.projectId, project.id)))
    addAll(await db.selectDistinct({ id: projectMessages.userId }).from(projectMessages).where(eq(projectMessages.projectId, project.id)))
    if (sensitive) addAll(await db.selectDistinct({ id: projectRules.createdBy }).from(projectRules).where(eq(projectRules.projectId, project.id)))
  }

  const accounts = personIds.size
    ? await db.select({ id: user.id, name: user.name, email: user.email, crewId: user.crewId, emailVisibility: user.emailVisibility })
        .from(user).where(inArray(user.id, [...personIds]))
    : []
  accounts.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  // Only an admin's file holds addresses, and only those the owner allows admins to see.
  const visibleEmails = sensitive
    ? await emailsVisibleTo(request.viewerId, accounts.map(account => ({ id: account.id, emailVisibility: account.emailVisibility })), { sharesBoard: true, managesBoard: true })
    : new Set<string>()
  const keys = new Map<string, string>()
  const people: Record<string, unknown>[] = []
  for (const account of accounts) {
    const key = `p${keys.size + 1}`
    keys.set(account.id, key)
    // Outside an admin's file a person is only their key and their tag: no name, no address, no kind.
    people.push(sensitive
      ? {
          key,
          name: account.name || account.email || 'Unnamed person',
          email: visibleEmails.has(account.id) ? account.email : null,
          kind: account.crewId ? 'crew' : 'person'
        }
      : { key, tag: tagOf(key) })
  }
  // A mention can name anyone on the board, not only the people this file points at. Their names are
  // replaced too, with tags after the file's own people.
  const boardPeople = sensitive ? [] : await projectPeople(project)
  const others = boardPeople.filter(person => !keys.has(person.id))
  const redactions = sensitive
    ? []
    : redactionsFor([
        ...accounts.map(account => ({ name: account.name, email: account.email, tag: tagOf(keys.get(account.id)!) })),
        ...others.map((person, index) => ({ name: person.name, email: person.email, tag: tagOf(`p${keys.size + index + 1}`) }))
      ])

  const fields = fieldRows.map(field => ({
    id: field.id,
    name: field.name,
    type: field.type,
    options: field.options,
    position: field.position,
    createdAt: field.createdAt
  }))
  const board = {
    name: project.name,
    description: project.description,
    status: project.status,
    dashboardWidgets: project.dashboardWidgets,
    labelColors: project.labelColors,
    crewRulesOn: project.crewRulesOn,
    archived: project.archivedAt != null,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    archivedAt: project.archivedAt,
    fields
  }

  const counts: Record<BackupCountSection, number> = {
    columns: columnRows.length,
    people: people.length,
    fields: fields.length,
    tasks: taskCount!.n,
    updates: updateCount!.n,
    activity: activityCount!.n,
    timeEntries: timeCount!.n,
    statusUpdates: statusCount,
    messages: messageCount,
    rules: ruleCount,
    attachments: attachmentCount
  }

  const now = new Date()
  return {
    request,
    full,
    selection,
    counts,
    keys,
    people,
    board,
    redactions,
    columns: columnRows.map(column => ({
      id: column.id,
      name: column.name,
      color: column.color,
      position: column.position,
      createdAt: column.createdAt,
      deletedAt: column.deletedAt
    })),
    fileName: backupFileName(project.name, now),
    exportedAt: now.toISOString()
  }
}

/** The mention tag of a person outside an admin's file: stable within the file, and carries no name. */
function tagOf(key: string): string {
  return `@person-${key.slice(1)}`
}

/** What a non-admin file must not show of a person: their address, their full name and their first name. */
function redactionsFor(people: { name: string, email: string | null, tag: string }[]): [string, string][] {
  const pairs: [string, string][] = []
  for (const person of people) {
    if (person.email) pairs.push([person.email, person.tag])
    if (person.name) pairs.push([person.name, person.tag])
    const first = person.name.split(/\s+/)[0] ?? ''
    if (first.length >= 3) pairs.push([first, person.tag])
  }
  return pairs.sort((a, b) => b[0].length - a[0].length)
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Replaces every name and address in the string VALUES of a canonical JSON text with the person's tag.
 * Keys are left alone, so a person called "Key" cannot change the shape of the file. A name is matched as a
 * whole word, with or without a leading @, which is how a mention is written.
 */
export function redactJsonValues(text: string, pairs: [string, string][]): string {
  if (pairs.length === 0) return text
  const tags = new Map(pairs.map(([value, tag]) => [value.toLowerCase(), tag]))
  const names = new RegExp(`(?<![\\p{L}\\p{N}_])@?(${pairs.map(([value]) => escapeRegExp(value)).join('|')})(?![\\p{L}\\p{N}_])`, 'giu')
  return text.replace(/"(?:[^"\\]|\\.)*"(:?)/g, (token, colon: string) => {
    if (colon) return token
    return `"${token.slice(1, -1).replace(names, (_match, name: string) => tags.get(name.toLowerCase()) ?? name)}"`
  })
}

/** Outside an admin's file an MCP or AI change is "agent": the key and the crew behind it are not named. */
function viaFor(via: string, sensitive: boolean): string {
  return !sensitive && (via === 'mcp' || via === 'ai') ? 'agent' : via
}

/** The key of a person in this backup, or null when the row has no person. */
function keyOf(plan: BackupPlan, userId: string | null): string | null {
  if (!userId) return null
  return plan.keys.get(userId) ?? null
}

/**
 * Walks one table a page at a time by id. `map` turns a row into the section's row; the rows are
 * written in id order, so the section is the same however the pages fall.
 */
async function* rowSection<T extends { id: string }, R>(
  fetch: (after: string | null) => Promise<T[]>,
  map: (rows: T[]) => Promise<R[]> | R[]
): AsyncGenerator<string> {
  yield '['
  let first = true
  let after: string | null = null
  for (;;) {
    const rows = await fetch(after)
    if (rows.length === 0) break
    let chunk = ''
    for (const row of await map(rows)) {
      chunk += `${first ? '' : ','}${canonicalValue(row)}`
      first = false
    }
    if (chunk) yield chunk
    after = rows[rows.length - 1]!.id
    if (rows.length < PAGE) break
  }
  yield ']'
}

function attachmentRows(plan: BackupPlan, taskIds: string[]) {
  const rows: Record<string, unknown>[] = []
  for (const taskId of taskIds) {
    const dir = taskAttachmentDir(taskId)
    for (const filename of attachmentFiles(taskId)) {
      const path = join(dir, filename)
      const bytes = readFileSync(path)
      const row: Record<string, unknown> = {
        id: filename,
        taskId,
        filename,
        contentType: contentTypeOf(filename),
        size: statSync(path).size,
        sha256: createHash('sha256').update(bytes).digest('hex')
      }
      if (plan.request.inlineAttachments) row.data = bytes.toString('base64')
      rows.push(row)
    }
  }
  return rows
}

/**
 * A section made of pages of ids, where each page of ids gives its rows: attachments and tasks. The rows
 * of one page are written together, in the order the ids came.
 */
async function* listSection<R>(pages: AsyncGenerator<string[]>, rowsOf: (ids: string[]) => Promise<R[]> | R[]): AsyncGenerator<string> {
  yield '['
  let first = true
  for await (const ids of pages) {
    let chunk = ''
    for (const row of await rowsOf(ids)) {
      chunk += `${first ? '' : ','}${canonicalValue(row)}`
      first = false
    }
    if (chunk) yield chunk
  }
  yield ']'
}

/** The task rows of one page, with their field values, blockers, GitHub links and the parent when it is in the backup. */
async function taskRows(plan: BackupPlan, tasks: (typeof projectTasks.$inferSelect)[]) {
  const staff = plan.request.audience === 'staff'
  const ids = tasks.map(task => task.id)
  const fieldRows = staff ? await db.select().from(taskFieldValues).where(inArray(taskFieldValues.taskId, ids)) : []
  const blockerRows = await db.select().from(taskDependencies).where(and(
    inArray(taskDependencies.blockedTaskId, ids),
    inArray(taskDependencies.blockerTaskId, taskIdsOf(plan.selection))
  ))
  const linkRows = visibleGithubLinks(plan.request.audience, await db.select().from(githubLinks).where(inArray(githubLinks.taskId, ids)))
  const parentIds = [...new Set(tasks.map(task => task.parentTaskId).filter((id): id is string => !!id))]
  const keptParents = new Set(parentIds.length
    ? (await db.select({ id: projectTasks.id }).from(projectTasks)
        .where(and(inArray(projectTasks.id, parentIds), inArray(projectTasks.id, taskIdsOf(plan.selection))))).map(row => row.id)
    : [])

  return tasks.map(task => ({
    id: task.id,
    columnId: task.columnId,
    parentTaskId: task.parentTaskId && keptParents.has(task.parentTaskId) ? task.parentTaskId : null,
    title: task.title,
    description: task.description,
    labels: task.tags,
    visibility: task.visibility,
    assignee: keyOf(plan, task.assigneeId),
    createdBy: keyOf(plan, task.createdBy),
    position: task.position,
    dueOn: task.dueOn,
    startOn: task.startOn,
    completedAt: task.completedAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    deletedAt: task.deletedAt,
    deletedBy: keyOf(plan, task.deletedBy),
    deletedVia: task.deletedVia,
    previousColumnId: task.previousColumnId,
    trashed: task.deletedAt != null,
    fieldValues: fieldRows.filter(row => row.taskId === task.id).map(row => ({ fieldId: row.fieldId, value: row.value })),
    blockedBy: blockerRows.filter(row => row.blockedTaskId === task.id).map(row => row.blockerTaskId),
    github: linkRows.filter(link => link.taskId === task.id).map(link => ({
      id: link.id,
      kind: link.kind,
      owner: link.owner,
      repo: link.repo,
      ref: link.ref,
      url: link.url,
      visibility: link.visibility,
      createdAt: link.createdAt
    }))
  }))
}

/**
 * The sections of the backup as text, in key order. Each piece is hashed as it is yielded. The caller
 * writes the opening brace before and the checksum after.
 */
async function* backupText(plan: BackupPlan, hash: Hash): AsyncGenerator<string> {
  const { selection } = plan
  const { audience } = plan.request
  const staff = audience === 'staff'
  const sensitive = staff && plan.request.admin
  const emit = (piece: string) => {
    // Every piece passes through here, so no section can leave a name or an address out of the redaction.
    const text = redactJsonValues(piece, plan.redactions)
    hash.update(text)
    return text
  }

  const sections: [string, () => AsyncGenerator<string>][] = [
    ['activity', async function* () {
      yield* rowSection(
        after => db.select().from(taskActivity)
          .where(and(activityWhere(selection, audience), after ? gt(taskActivity.id, after) : undefined))
          .orderBy(asc(taskActivity.id)).limit(PAGE),
        rows => rows.map(row => ({
          id: row.id,
          taskId: row.taskId,
          actor: keyOf(plan, row.actorId),
          via: viaFor(row.via, sensitive),
          kind: row.kind,
          detail: row.detail,
          createdAt: row.createdAt
        }))
      )
    }],
    ['attachments', async function* () {
      yield* listSection(taskIdPages(selection), ids => attachmentRows(plan, ids))
    }],
    ['audience', async function* () {
      yield canonicalValue(audience)
    }],
    ['board', async function* () {
      yield canonicalValue(plan.board)
    }],
    ['columns', async function* () {
      yield canonicalValue(plan.columns)
    }],
    ['counts', async function* () {
      yield canonicalValue(plan.counts)
    }],
    ['exportedAt', async function* () {
      yield canonicalValue(plan.exportedAt)
    }],
    ['format', async function* () {
      yield canonicalValue(BACKUP_FORMAT)
    }],
    ['includesSensitive', async function* () {
      yield canonicalValue(sensitive)
    }],
    ['messages', async function* () {
      if (!plan.full) {
        yield '[]'
        return
      }
      yield* rowSection(
        after => db.select().from(projectMessages)
          .where(and(eq(projectMessages.projectId, plan.request.project.id), after ? gt(projectMessages.id, after) : undefined))
          .orderBy(asc(projectMessages.id)).limit(PAGE),
        rows => rows.map(row => ({
          id: row.id,
          parentId: row.parentId,
          title: row.title,
          body: row.body,
          person: keyOf(plan, row.userId),
          createdAt: row.createdAt
        }))
      )
    }],
    ['people', async function* () {
      yield canonicalValue(plan.people)
    }],
    ['rules', async function* () {
      if (!plan.full || !sensitive) {
        yield '[]'
        return
      }
      yield* rowSection(
        after => db.select().from(projectRules)
          .where(and(eq(projectRules.projectId, plan.request.project.id), after ? gt(projectRules.id, after) : undefined))
          .orderBy(asc(projectRules.id)).limit(PAGE),
        rows => rows.map(row => ({
          id: row.id,
          name: row.name,
          enabled: row.enabled,
          trigger: row.trigger,
          conditions: row.conditions,
          actions: row.actions,
          position: row.position,
          createdBy: keyOf(plan, row.createdBy),
          createdAt: row.createdAt,
          updatedAt: row.updatedAt
        }))
      )
    }],
    ['source', async function* () {
      yield canonicalValue({ instance: plan.request.instance, boardId: plan.request.project.id, boardName: plan.request.project.name })
    }],
    ['statusUpdates', async function* () {
      if (!plan.full) {
        yield '[]'
        return
      }
      yield* rowSection(
        after => db.select().from(projectStatusUpdates)
          .where(and(eq(projectStatusUpdates.projectId, plan.request.project.id), after ? gt(projectStatusUpdates.id, after) : undefined))
          .orderBy(asc(projectStatusUpdates.id)).limit(PAGE),
        rows => rows.map(row => ({
          id: row.id,
          status: row.status,
          body: row.body,
          person: keyOf(plan, row.userId),
          createdAt: row.createdAt
        }))
      )
    }],
    ['tasks', async function* () {
      yield* listSection(taskIdPages(selection), async (ids) => {
        const tasks = await db.select().from(projectTasks).where(inArray(projectTasks.id, ids)).orderBy(asc(projectTasks.id))
        return taskRows(plan, tasks)
      })
    }],
    ['timeEntries', async function* () {
      if (!sensitive) {
        yield '[]'
        return
      }
      yield* rowSection(
        after => db.select().from(timeEntries)
          .where(and(inArray(timeEntries.taskId, taskIdsOf(selection)), after ? gt(timeEntries.id, after) : undefined))
          .orderBy(asc(timeEntries.id)).limit(PAGE),
        rows => rows.map(row => ({
          id: row.id,
          taskId: row.taskId,
          person: keyOf(plan, row.userId),
          minutes: row.minutes,
          day: row.day,
          note: row.note,
          createdAt: row.createdAt
        }))
      )
    }],
    ['updates', async function* () {
      yield* rowSection(
        after => db.select().from(taskComments)
          .where(and(updatesWhere(selection, audience), after ? gt(taskComments.id, after) : undefined))
          .orderBy(asc(taskComments.id)).limit(PAGE),
        rows => rows.map(row => ({
          id: row.id,
          taskId: row.taskId,
          author: keyOf(plan, row.userId),
          body: row.body,
          visibility: row.visibility,
          replyToId: row.replyToId,
          createdAt: row.createdAt,
          editedAt: row.editedAt,
          createdVia: viaFor(row.createdVia, sensitive)
        }))
      )
    }],
    ['version', async function* () {
      yield canonicalValue(BACKUP_VERSION)
    }]
  ]

  let firstSection = true
  for (const [name, write] of sections) {
    yield emit(`${firstSection ? '' : ','}${JSON.stringify(name)}:`)
    firstSection = false
    for await (const piece of write()) yield emit(piece)
  }
}

/**
 * The whole file: the opening brace goes out at once, before any lookup, so a download starts at once.
 * The board is read after that. Once everything is written, the checksum closes the object.
 * `audit` is false for the checksum pass, which only needs the text, not a second audit row.
 */
async function* writeBackup(input: BackupRequest | BackupPlan, hash: Hash, audit: boolean): AsyncGenerator<string> {
  hash.update('{')
  yield '{'
  const plan = 'counts' in input ? input : await prepareBackup(input)
  if (audit && !('counts' in input)) {
    await recordBackupAudit(plan).catch(error => console.error('[backup] the audit row was not written', error))
  }
  for await (const piece of backupText(plan, hash)) yield piece
  hash.update('}')
  yield `,"checksum":"sha256:${hash.digest('hex')}"}`
}

/**
 * The checksum this request would give, without sending anything: the file is written through once and
 * the text is thrown away. The route uses it for the ETag, so an unchanged board answers 304.
 */
export async function backupChecksum(request: BackupRequest): Promise<string> {
  let last = ''
  for await (const piece of writeBackup(request, createHash('sha256'), false)) last = piece
  const match = /sha256:[0-9a-f]{64}/.exec(last)
  if (!match) throw new Error('the backup did not end with its checksum')
  return match[0]
}

/**
 * The backup as a stream of bytes. Takes the request (the file is read while it streams) or a plan that
 * was prepared already. Releases the caller's slot for this board when the stream ends or is cancelled.
 */
export function streamBoardBackup(input: BackupRequest | BackupPlan): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const pieces = writeBackup(input, createHash('sha256'), true)
  const request = 'counts' in input ? input.request : input
  const slot = backupSlotKey(request.project.id, request.callerId)
  let released = false
  const release = () => {
    if (released) return
    released = true
    releaseBackupSlot(slot)
  }
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await pieces.next()
        if (next.done) {
          release()
          controller.close()
        } else {
          controller.enqueue(encoder.encode(next.value))
        }
      } catch (error) {
        release()
        controller.error(error)
      }
    },
    async cancel() {
      await pieces.return(undefined).catch(() => {})
      release()
    }
  })
}

/** The audit line for a backup: counts only, never the content. */
export async function recordBackupAudit(plan: BackupPlan): Promise<void> {
  const { request } = plan
  const c = plan.counts
  const summary = `exported board backup (${request.audience === 'staff' ? 'team' : 'read-only view'}): ${c.tasks} cards, ${c.updates} updates, ${c.activity} activity rows, ${c.timeEntries} time entries, ${c.attachments} attachments listed${request.inlineAttachments ? ' (bytes included)' : ''}`
  await db.insert(agentAudit).values({
    id: genId(),
    userId: request.viewerId,
    apiKeyId: request.keyId,
    keyName: request.keyName,
    tool: 'board_backup',
    toolTitle: 'Download a board backup',
    projectId: request.project.id,
    projectName: request.project.name,
    summary,
    createdAt: Date.now()
  })
}
