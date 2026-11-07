// The built-in rules of a crew board: the four mechanical PM duties that used to wait on Pia's memory.
// Promotion (a Backlog card whose last blocker is done goes to To do), gate routing (a card that Pia
// approved goes through Verify UX, CQ and QA by its tags, then to Verify for Boss), the time-log check
// (a card entering Verify PM with no time logged goes back to To do, once) and the failing-test clock
// (a card tagged `test failing` that sits in Blocked gets a note to Pia at 15 minutes and to Boss at 45).
// They run on a crew board while the board's crew rules switch is on. Each step is written through the
// rule actions, so it reads in the activity log as done by the rule, not by a person.
// The pure parts (the gate order, the timings, the tag lines) take no database and are tested on their own.
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../db'
import { crewBoardMembers, crewBoards, projectColumns, projects, projectTasks, taskActivity, taskComments, taskDependencies, timeEntries } from '../db/schema'
import { runAction, type FollowUp, type RuleEvent, type RuleProject, type RuleSource } from './ruleActions'
import type { ActivityEntry } from './taskActivity'

export const RULE_PROMOTE = 'Crew: promotion'
export const RULE_GATES = 'Crew: gate routing'
export const RULE_TIME_LOG = 'Crew: time-log check'
export const RULE_TEST_CLOCK = 'Crew: failing-test clock'

export const COLUMN = { backlog: 'Backlog', todo: 'To do', pm: 'Verify PM', verify: 'Verify', blocked: 'Blocked' } as const
export const PM_APPROVED = 'pm approved'
export const TEST_FAILING = 'test failing'
export const TEST_CLOCK_STAGES = [{ minutes: 15, person: 'pia' }, { minutes: 45, person: 'boss' }] as const

export type GateKey = 'ux' | 'cq' | 'qa'
export interface Gate {
  key: GateKey
  column: string
  /** The tag a reviewer sets when the whole card passes the gate. */
  approved: string
  /** The tag a reviewer sets on a subtask with a problem. */
  violation: string
  /** The crew key of the reviewer who owns the gate. */
  reviewer: string
}
export const GATES: Gate[] = [
  { key: 'ux', column: 'Verify UX', approved: 'ux approved', violation: 'ux violation', reviewer: 'usher' },
  { key: 'cq', column: 'Verify CQ', approved: 'cq approved', violation: 'cq violation', reviewer: 'nina' },
  { key: 'qa', column: 'Verify QA', approved: 'qa approved', violation: 'qa violation', reviewer: 'quincy' }
]

// ---- pure parts -----------------------------------------------------------------

/**
 * The gates a card goes through, in order. CQ and QA always: the card says they are never skipped.
 * UX only when a tag `verify UX` is on the card or one of its subtasks.
 */
export function gatesRequired(cardTags: readonly string[], subtaskTags: readonly string[]): Gate[] {
  const wantsUx = [...cardTags, ...subtaskTags].includes('verify ux')
  return GATES.filter(gate => gate.key !== 'ux' || wantsUx)
}

/** The first required gate its card has not yet passed, or null when every gate has passed. */
export function firstOpenGate(required: readonly Gate[], passed: ReadonlySet<GateKey>): Gate | null {
  return required.find(gate => !passed.has(gate.key)) ?? null
}

/** The violation tag of any gate on the card or its subtasks, when one is set. */
export function hasViolation(tags: readonly string[]): boolean {
  return GATES.some(gate => tags.includes(gate.violation))
}

/** The failing-test stage the card has reached: 15 or 45 minutes in Blocked, or null before 15. */
export function testClockStage(ageMs: number): (typeof TEST_CLOCK_STAGES)[number][] {
  return TEST_CLOCK_STAGES.filter(stage => ageMs >= stage.minutes * 60_000)
}

/** One activity line per tag the save added. Removed tags write no line; only who added a tag counts. */
export function tagAddEntries(before: readonly string[], after: readonly string[]): ActivityEntry[] {
  return after.filter(tag => !before.includes(tag)).map(tag => ({ kind: 'label', detail: { to: tag } }))
}

/** Whether a board's column names make it a crew board: it has the Verify PM column. */
export function isCrewColumnSet(names: readonly string[]): boolean {
  return names.includes(COLUMN.pm)
}

// ---- database parts -------------------------------------------------------------

async function columnIdNamed(projectId: string, name: string): Promise<string | null> {
  const [row] = await db.select({ id: projectColumns.id }).from(projectColumns)
    .where(and(eq(projectColumns.projectId, projectId), eq(projectColumns.name, name), isNull(projectColumns.deletedAt)))
  return row?.id ?? null
}

async function columnNameOf(columnId: string): Promise<string | null> {
  const [row] = await db.select({ name: projectColumns.name }).from(projectColumns).where(eq(projectColumns.id, columnId))
  return row?.name ?? null
}

/** Whether a board is a crew board: it has the Verify PM column. Other boards keep their behaviour. */
export async function isCrewBoard(projectId: string): Promise<boolean> {
  const names = await db.select({ name: projectColumns.name }).from(projectColumns)
    .where(and(eq(projectColumns.projectId, projectId), isNull(projectColumns.deletedAt)))
  return isCrewColumnSet(names.map(column => column.name))
}

/**
 * Whether the built-in rules run on this project: it is a crew board and its crew rules switch is on,
 * and it is not archived. Any other board gets nothing from the rules in this file.
 */
export async function crewRulesRunFor(project: Pick<RuleProject, 'id'>): Promise<boolean> {
  const [row] = await db.select({ crewRulesOn: projects.crewRulesOn, archivedAt: projects.archivedAt }).from(projects)
    .where(eq(projects.id, project.id))
  if (!row || !row.crewRulesOn || row.archivedAt) return false
  return isCrewBoard(project.id)
}

/** The crew members of a board by their crew key (pia, usher, nina, quincy, boss), with their account ids. */
export async function crewMemberIds(projectId: string): Promise<Map<string, string>> {
  const rows = await db.select({ personKey: crewBoardMembers.personKey, userId: crewBoardMembers.userId })
    .from(crewBoardMembers)
    .innerJoin(crewBoards, eq(crewBoards.id, crewBoardMembers.linkId))
    .where(eq(crewBoards.projectId, projectId))
  return new Map(rows.map(row => [row.personKey, row.userId]))
}

/** The account that made the latest activity line adding this tag, or null when none did. */
export async function tagSetterOf(taskId: string, tag: string): Promise<string | null> {
  const [row] = await db.select({ actorId: taskActivity.actorId }).from(taskActivity)
    .where(and(eq(taskActivity.taskId, taskId), eq(taskActivity.kind, 'label'), sql`${taskActivity.detail}->>'to' = ${tag}`))
    .orderBy(desc(taskActivity.createdAt))
    .limit(1)
  return row?.actorId ?? null
}

async function subtasksOf(taskId: string) {
  return db.select().from(projectTasks)
    .where(and(eq(projectTasks.parentTaskId, taskId), isNull(projectTasks.deletedAt)))
}

/** The author of a rule's comment and the rule source for its actions: Pia's account, else the board owner's. */
async function sourceFor(project: RuleProject, name: string, members: Map<string, string>): Promise<RuleSource> {
  return { id: `crew:${name}`, name, createdBy: members.get('pia') ?? project.userId, mayChangeVisibility: false }
}

/** Promotion: a Backlog card whose last open blocker just finished goes to To do. */
async function promote(event: RuleEvent, project: RuleProject, members: Map<string, string>, followUp: FollowUp) {
  const dependents = await db.select({ id: taskDependencies.blockedTaskId }).from(taskDependencies)
    .where(eq(taskDependencies.blockerTaskId, event.taskId))
  const todo = await columnIdNamed(project.id, COLUMN.todo)
  if (!todo) return
  const source = await sourceFor(project, RULE_PROMOTE, members)
  for (const { id } of dependents) {
    const [task] = await db.select().from(projectTasks).where(and(eq(projectTasks.id, id), isNull(projectTasks.deletedAt)))
    if (!task || (await columnNameOf(task.columnId)) !== COLUMN.backlog) continue
    const open = await db.select({ id: taskDependencies.blockerTaskId }).from(taskDependencies)
      .innerJoin(projectTasks, eq(projectTasks.id, taskDependencies.blockerTaskId))
      .where(and(eq(taskDependencies.blockedTaskId, id), isNull(projectTasks.completedAt), isNull(projectTasks.deletedAt)))
    if (open.length) continue
    await runAction({ kind: 'move_to_column', columnId: todo }, project, source, id, followUp)
    if (!task.assigneeId) {
      await runAction({ kind: 'add_label', label: 'needs assignee' }, project, source, id, followUp)
      await runAction({ kind: 'add_comment', text: '@pia this card is in To do and has no assignee.' }, project, source, id, followUp)
    }
  }
}

/** Time-log check: a card entering Verify PM with no time logged goes back to To do, once. */
async function checkTimeLog(event: RuleEvent, project: RuleProject, members: Map<string, string>, followUp: FollowUp) {
  const pm = await columnIdNamed(project.id, COLUMN.pm)
  if (!pm || event.detail !== pm) return
  const [task] = await db.select().from(projectTasks).where(and(eq(projectTasks.id, event.taskId), isNull(projectTasks.deletedAt)))
  if (!task || task.columnId !== pm) return
  const ids = [task.id, ...(await subtasksOf(task.id)).map(sub => sub.id)]
  const [logged] = await db.select({ minutes: sql<number>`coalesce(sum(${timeEntries.minutes}), 0)` }).from(timeEntries)
    .where(inArray(timeEntries.taskId, ids))
  if (Number(logged?.minutes ?? 0) > 0) return
  // Once per card: the standard update already on the card means the check has done its part.
  const [done] = await db.select({ id: taskComments.id }).from(taskComments)
    .where(and(eq(taskComments.taskId, task.id), sql`${taskComments.body} like ${`Rule "${RULE_TIME_LOG}"%`}`))
    .limit(1)
  if (done) return
  const source = await sourceFor(project, RULE_TIME_LOG, members)
  const todo = await columnIdNamed(project.id, COLUMN.todo)
  if (!todo) return
  await runAction({ kind: 'move_to_column', columnId: todo }, project, source, task.id, followUp)
  await runAction({ kind: 'add_comment', text: 'No time is logged on this card, so it goes back to To do. Log your time with log_time and move it to Verify PM again.' }, project, source, task.id, followUp)
}

/** Gate routing: a card in Verify PM that Pia approved goes through its gates by tag, then to Verify. */
async function routeGates(taskId: string, project: RuleProject, members: Map<string, string>, followUp: FollowUp) {
  const pm = await columnIdNamed(project.id, COLUMN.pm)
  const [task] = await db.select().from(projectTasks).where(and(eq(projectTasks.id, taskId), isNull(projectTasks.deletedAt)))
  if (!task || !pm || task.columnId !== pm) return
  const pia = members.get('pia')
  if (!pia || !task.tags.includes(PM_APPROVED) || (await tagSetterOf(taskId, PM_APPROVED)) !== pia) return
  const subs = await subtasksOf(taskId)
  const subTags = subs.flatMap(sub => sub.tags)
  const source = await sourceFor(project, RULE_GATES, members)
  if (hasViolation([...task.tags, ...subTags])) {
    const todo = await columnIdNamed(project.id, COLUMN.todo)
    if (todo) await runAction({ kind: 'move_to_column', columnId: todo }, project, source, taskId, followUp)
    return
  }
  const passed = new Set<GateKey>()
  for (const gate of GATES) {
    const reviewer = members.get(gate.reviewer)
    if (task.tags.includes(gate.approved) && reviewer && (await tagSetterOf(taskId, gate.approved)) === reviewer) passed.add(gate.key)
  }
  const next = firstOpenGate(gatesRequired(task.tags, subTags), passed)
  if (next) {
    const reviewer = members.get(next.reviewer)
    const column = await columnIdNamed(project.id, next.column)
    if (!reviewer || !column) return
    await runAction({ kind: 'move_to_column', columnId: column }, project, source, taskId, followUp)
    await runAction({ kind: 'assign', assigneeId: reviewer }, project, source, taskId, followUp)
    return
  }
  const boss = members.get('boss')
  const verify = await columnIdNamed(project.id, COLUMN.verify)
  if (!boss || !verify) return
  await runAction({ kind: 'move_to_column', columnId: verify }, project, source, taskId, followUp)
  await runAction({ kind: 'assign', assigneeId: boss }, project, source, taskId, followUp)
}

/**
 * Runs the built-in crew rules for one change. Called by the rule engine before the board's own rules,
 * for every change. Never throws: a failed step is logged and the change it followed stands.
 */
export async function runCrewRules(event: RuleEvent, project: RuleProject, followUp: FollowUp): Promise<void> {
  try {
    if (!(await crewRulesRunFor(project))) return
    const members = await crewMemberIds(project.id)
    if (event.type === 'task_completed') await promote(event, project, members, followUp)
    if (event.type === 'task_moved') await checkTimeLog(event, project, members, followUp)
    if (event.type === 'task_moved' || event.type === 'tags_changed') await routeGates(event.taskId, project, members, followUp)
  } catch (error) {
    console.error(`[rules] crew rules stopped on task ${event.taskId}: ${(error as Error).message}`)
  }
}

/**
 * The failing-test clock: a card tagged `test failing` in Blocked gets one note to Pia at 15 minutes and one
 * to Boss at 45. The note carries the time the card entered Blocked, so a card that leaves and comes back starts
 * again, and a note is never repeated for the same stay.
 */
export async function sweepTestClock(now = Date.now()): Promise<number> {
  const rows = await db.select({ task: projectTasks, project: projects }).from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .where(and(
      isNull(projectTasks.deletedAt),
      isNull(projects.archivedAt),
      eq(projects.crewRulesOn, true),
      sql`${projectTasks.tags} @> '["test failing"]'::jsonb`
    ))
  let sent = 0
  for (const { task, project } of rows) {
    if ((await columnNameOf(task.columnId)) !== COLUMN.blocked) continue
    if (!(await crewRulesRunFor({ id: project.id }))) continue
    const [entered] = await db.select({ at: taskActivity.createdAt }).from(taskActivity)
      .where(and(eq(taskActivity.taskId, task.id), eq(taskActivity.kind, 'moved'), sql`${taskActivity.detail}->>'to' = 'Blocked'`))
      .orderBy(desc(taskActivity.createdAt))
      .limit(1)
    const since = entered?.at ?? task.updatedAt
    const members = await crewMemberIds(project.id)
    const projectRow: RuleProject = { id: project.id, name: project.name, userId: project.userId, teamId: project.teamId, customerId: project.customerId }
    for (const stage of testClockStage(now - since)) {
      const marker = `[entered=${since} stage=${stage.minutes}]`
      const [already] = await db.select({ id: taskComments.id }).from(taskComments)
        .where(and(eq(taskComments.taskId, task.id), sql`${taskComments.body} like ${`%${marker}%`}`))
        .limit(1)
      if (already || !members.get(stage.person)) continue
      const source = await sourceFor(projectRow, RULE_TEST_CLOCK, members)
      const text = stage.person === 'pia'
        ? `@pia "test failing" has sat in Blocked for 15 minutes. Find the cause, or say what was tried. ${marker}`
        : `@boss "test failing" has sat in Blocked for 45 minutes. Pia has had 15 minutes; this needs a decision. ${marker}`
      await runAction({ kind: 'add_comment', text }, projectRow, source, task.id, async () => {})
      sent++
    }
  }
  return sent
}
