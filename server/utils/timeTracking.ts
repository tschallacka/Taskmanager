// Time entries and timers, shared by the HTTP endpoints and the MCP tools.
import { and, eq, gte, lte, desc, inArray } from 'drizzle-orm'
import { db } from '../db'
import { projects, projectTasks, timeEntries, timeTimers, user } from '../db/schema'
import { MAX_ENTRY_MINUTES, parseDuration } from '#shared/utils/duration'
import { parseDueOn } from './taskFields'

const MAX_NOTE = 500
const MAX_RANGE_DAYS = 92

function bad(message: string): never {
  throw createError({ statusCode: 400, message })
}

export function genTimeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

/** Minutes from a request's `minutes` (a number) or `duration` (what a person types). */
export function parseEntryMinutes(body: { minutes?: unknown, duration?: unknown }): number {
  const raw = body.minutes ?? body.duration
  const minutes = parseDuration(raw)
  if (minutes === null) {
    bad(raw === undefined
      ? 'Say how long it took, such as 1h 30m'
      : `Time is written like 1h 30m, 1:30 or 45m, between a minute and ${MAX_ENTRY_MINUTES / 60} hours`)
  }
  return minutes
}

/** The day the work was done, `YYYY-MM-DD`; today when it is not given. */
export function parseEntryDay(raw: unknown): string {
  if (raw === undefined || raw === null || raw === '') return new Date().toISOString().slice(0, 10)
  return parseDueOn(raw) ?? bad('Say which day the time belongs to')
}

export function parseEntryNote(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, MAX_NOTE) : ''
}

/** A `from`/`to` pair of days, for a timesheet. Both are required and the span is bounded. */
export function parseRange(from: unknown, to: unknown): { from: string, to: string } {
  const start = parseDueOn(from)
  const end = parseDueOn(to)
  if (!start || !end) bad('A range needs from and to, as YYYY-MM-DD')
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000
  if (days < 0) bad('The range ends before it starts')
  if (days > MAX_RANGE_DAYS) bad(`A range is at most ${MAX_RANGE_DAYS} days`)
  return { from: start, to: end }
}

/** An entry as the API returns it, with who logged it and what it was spent on. */
export async function loadEntries(where: ReturnType<typeof and>) {
  const rows = await db
    .select({
      id: timeEntries.id,
      taskId: timeEntries.taskId,
      taskTitle: projectTasks.title,
      projectId: timeEntries.projectId,
      projectName: projects.name,
      minutes: timeEntries.minutes,
      day: timeEntries.day,
      note: timeEntries.note,
      createdAt: timeEntries.createdAt,
      authorId: user.id,
      authorName: user.name,
      authorImage: user.image
    })
    .from(timeEntries)
    .innerJoin(projectTasks, eq(projectTasks.id, timeEntries.taskId))
    .innerJoin(projects, eq(projects.id, timeEntries.projectId))
    .leftJoin(user, eq(user.id, timeEntries.userId))
    .where(where)
    .orderBy(desc(timeEntries.day), desc(timeEntries.createdAt))
    .limit(2000)

  return rows.map(({ authorId, authorName, authorImage, ...rest }) => ({
    ...rest,
    author: { id: authorId ?? '', name: authorName ?? 'Unknown', image: authorImage }
  }))
}

export function entriesWhere(filter: { taskId?: string, projectIds?: string[], userId?: string, from?: string, to?: string }) {
  return and(
    filter.taskId ? eq(timeEntries.taskId, filter.taskId) : undefined,
    filter.projectIds ? inArray(timeEntries.projectId, filter.projectIds) : undefined,
    filter.userId ? eq(timeEntries.userId, filter.userId) : undefined,
    filter.from ? gte(timeEntries.day, filter.from) : undefined,
    filter.to ? lte(timeEntries.day, filter.to) : undefined
  )
}

export async function logEntry(input: { taskId: string, projectId: string, userId: string, minutes: number, day: string, note: string }) {
  const [created] = await db.insert(timeEntries).values({ id: genTimeId(), ...input, createdAt: Date.now() }).returning()
  return created!
}

// ─── Timers ────────────────────────────────────────────────

export async function currentTimer(userId: string) {
  const [row] = await db
    .select({
      taskId: timeTimers.taskId,
      startedAt: timeTimers.startedAt,
      taskTitle: projectTasks.title,
      projectId: projectTasks.projectId,
      projectName: projects.name
    })
    .from(timeTimers)
    .innerJoin(projectTasks, eq(projectTasks.id, timeTimers.taskId))
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .where(eq(timeTimers.userId, userId))
  return row ?? null
}

/**
 * Stops the person's running timer and logs what it measured, rounded to the
 * nearest minute with a floor of one and a ceiling of a day. Nothing running is
 * not an error: it returns null.
 */
export async function stopTimer(userId: string, options: { day?: string, now?: number, note?: string } = {}) {
  const [timer] = await db.select().from(timeTimers).where(eq(timeTimers.userId, userId))
  if (!timer) return null

  const [task] = await db.select({ projectId: projectTasks.projectId }).from(projectTasks).where(eq(projectTasks.id, timer.taskId))
  await db.delete(timeTimers).where(eq(timeTimers.userId, userId))
  if (!task) return null

  const elapsed = (options.now ?? Date.now()) - timer.startedAt
  const minutes = Math.min(MAX_ENTRY_MINUTES, Math.max(1, Math.round(elapsed / 60_000)))
  return logEntry({
    taskId: timer.taskId,
    projectId: task.projectId,
    userId,
    minutes,
    day: options.day ?? new Date(timer.startedAt).toISOString().slice(0, 10),
    note: options.note ?? ''
  })
}

/** Starts a timer on a task, first stopping and logging any other one. */
export async function startTimer(userId: string, taskId: string, day?: string) {
  const stopped = await stopTimer(userId, { day })
  await db.insert(timeTimers).values({ userId, taskId, startedAt: Date.now() })
  return stopped
}
