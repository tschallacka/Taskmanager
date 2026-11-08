// The writing step of a board import (POST /api/projects/:id/import and POST /api/projects/import). It reads
// the target board into the plain values the planner needs (server/utils/boardImportPlan.ts), and when the
// import is not a dry run it writes the plan in one transaction. It writes ONLY the rows of the plan. It does
// not call the notification, agent-event, rule, GitHub or activity code: a backup row keeps the date and
// author it had, and nothing is sent, fired or synced because of it.
import { count, eq } from 'drizzle-orm'
import { db } from '../db'
import {
  agentAudit, boardImports, githubLinks, member, projectColumns, projectFields, projectMessages, projectRules,
  projectStatusUpdates, projectTasks, projects, taskActivity, taskComments, taskDependencies, taskFieldValues, timeEntries, user
} from '../db/schema'
import { isTeamManagerRole } from './boardAdmin'
import type { ImportPlan, ImportTarget } from './boardImportPlan'
import { genId } from './projects'

const CHUNK = 500
const running = new Set<string>()

/** One import at a time per board. Returns false when one is already running. */
export function claimImportSlot(projectId: string): boolean {
  if (running.has(projectId)) return false
  running.add(projectId)
  return true
}

export function releaseImportSlot(projectId: string): void {
  running.delete(projectId)
}

/** The largest backup a request may send. Default 100 MB; env IMPORT_MAX_BYTES. */
export function importMaxBytes(): number {
  const raw = Number(process.env.IMPORT_MAX_BYTES)
  return Number.isFinite(raw) && raw > 0 ? raw : 100 * 1024 * 1024
}

/** What the caller is, for the admin rule. Plain values, so the rule is testable without a request. */
export interface ImportCaller {
  isInstanceAdmin: boolean
  /** The caller's role in the team that owns the board, or null when they are not a member of it. */
  teamRole: string | null
  /** The board has no team and the caller owns it: a personal workspace. */
  personalOwner: boolean
  /** The caller is a crew account, or acts through a crew's key. A crew imports only into its own board. */
  isCrew: boolean
  /** The board is the caller's crew's own (its shadow board, or the board the crew was made on). */
  crewOwnsBoard: boolean
}

/**
 * The admin rule for imports (owner's decision): the instance admin, or an owner or admin of the team that
 * owns the board. A personal board (no team) may be imported by its owner. A crew may import into its own
 * board only (its shadow board, or the board it was made on), so it can move and restore its own work; never
 * into any other board, whatever role it holds. Returns the sentence to refuse with, or null when the caller
 * may import.
 */
export function importRefusal(caller: ImportCaller): string | null {
  if (caller.isCrew) {
    return caller.crewOwnsBoard
      ? null
      : 'A crew can import a board backup only into its own board. Ask a team owner or admin.'
  }
  if (caller.isInstanceAdmin) return null
  if (caller.teamRole && isTeamManagerRole(caller.teamRole)) return null
  if (caller.personalOwner) return null
  return 'Only a team owner or admin, or the instance admin, can import a board backup.'
}

/** Reads the target board into the planner's plain values. */
export async function loadImportTarget(projectId: string, importer: { userId: string, name: string, isOwner: boolean }): Promise<ImportTarget> {
  const [project] = await db.select({ id: projects.id, teamId: projects.teamId, userId: projects.userId }).from(projects).where(eq(projects.id, projectId))
  const columns = await db.select({
    id: projectColumns.id, name: projectColumns.name, position: projectColumns.position, deletedAt: projectColumns.deletedAt
  }).from(projectColumns).where(eq(projectColumns.projectId, projectId))
  const fields = await db.select().from(projectFields).where(eq(projectFields.projectId, projectId))
  const tasks = await db.select({
    id: projectTasks.id, columnId: projectTasks.columnId, parentTaskId: projectTasks.parentTaskId, position: projectTasks.position
  }).from(projectTasks).where(eq(projectTasks.projectId, projectId))
  const imports = await db.select().from(boardImports).where(eq(boardImports.projectId, projectId))
  const [rules] = await db.select({ n: count() }).from(projectRules).where(eq(projectRules.projectId, projectId))

  let members: ImportTarget['members'] = []
  if (project?.teamId) {
    members = await db.select({ userId: user.id, name: user.name, email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, project.teamId))
  } else if (project) {
    const [owner] = await db.select({ userId: user.id, name: user.name, email: user.email }).from(user).where(eq(user.id, project.userId))
    members = owner ? [owner] : []
  }
  if (!members.some(candidate => candidate.userId === importer.userId)) {
    const [self] = await db.select({ userId: user.id, name: user.name, email: user.email }).from(user).where(eq(user.id, importer.userId))
    if (self) members.push(self)
  }

  return {
    projectId,
    importer,
    columns,
    fields: fields.map(field => ({ id: field.id, name: field.name, type: field.type, options: field.options })),
    members,
    tasks,
    imports: imports.map(row => ({
      kind: row.kind, sourceInstance: row.sourceInstance, sourceBoardId: row.sourceBoardId,
      sourceTaskId: row.sourceTaskId, targetId: row.targetId, taskId: row.taskId
    })),
    ruleCount: rules?.n ?? 0,
    creating: false
  }
}

/** Plans an import into a board that does not exist yet. Its board row is written by writeImportPlan. */
export function emptyTargetFor(projectId: string, importer: { userId: string, name: string, isOwner: boolean }): ImportTarget {
  return { projectId, importer, columns: [], fields: [], members: [{ userId: importer.userId, name: importer.name, email: null }], tasks: [], imports: [], ruleCount: 0, creating: true }
}

/** Inserts rows in chunks, so a large import stays under the statement's parameter limit. */
async function insertRows<T extends object>(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  table: T,
  rows: Record<string, unknown>[]
) {
  for (let at = 0; at < rows.length; at += CHUNK) {
    // The planner builds every row of one table with the same keys, so one statement per chunk is exact.
    await (tx as unknown as { insert: (t: T) => { values: (v: unknown) => Promise<unknown> } }).insert(table).values(rows.slice(at, at + CHUNK))
  }
}

export interface WriteRequest {
  /** The caller's user id: the importer of record. */
  importerId: string
  /** The name the audit row gives: "Board settings" for a session, or the key's name. */
  keyId: string | null
  keyName: string
  /** Set when the import makes the board: its team (or null for a personal board) and the name to give it. */
  createBoard: { teamId: string | null, name: string | null } | null
}

/** Writes the plan in one transaction. Nothing is written when it throws. */
export async function writeImportPlan(plan: ImportPlan, request: WriteRequest): Promise<void> {
  await db.transaction(async (tx) => {
    if (request.createBoard && plan.board) {
      const board = plan.board
      await tx.insert(projects).values({
        id: plan.projectId,
        userId: request.importerId,
        teamId: request.createBoard.teamId,
        name: request.createBoard.name?.trim() || String(board.name),
        description: String(board.description ?? ''),
        status: (board.status as string | null) ?? null,
        dashboardWidgets: (board.dashboardWidgets as string[] | null) ?? null,
        labelColors: (board.labelColors as Record<string, string>) ?? {},
        crewRulesOn: Boolean(board.crewRulesOn),
        archivedAt: (board.archivedAt as number | null) ?? null,
        createdAt: Number(board.createdAt),
        updatedAt: Number(board.updatedAt)
      })
    }
    await insertRows(tx, projectColumns, plan.columns)
    await insertRows(tx, projectFields, plan.fields)
    await insertRows(tx, projectTasks, plan.tasks)
    await insertRows(tx, taskFieldValues, plan.fieldValues)
    await insertRows(tx, taskDependencies, plan.blockers)
    await insertRows(tx, githubLinks, plan.githubLinks)
    await insertRows(tx, taskComments, plan.updates)
    await insertRows(tx, taskActivity, plan.activity)
    await insertRows(tx, timeEntries, plan.timeEntries)
    await insertRows(tx, projectStatusUpdates, plan.statusUpdates)
    await insertRows(tx, projectMessages, plan.messages)
    await insertRows(tx, projectRules, plan.rules)
    await insertRows(tx, boardImports, plan.imports)
    const counts = plan.report.created
    await tx.insert(agentAudit).values({
      id: genId(),
      userId: request.importerId,
      apiKeyId: request.keyId,
      keyName: request.keyName,
      tool: 'board_import',
      toolTitle: 'Import a board backup',
      projectId: plan.projectId,
      projectName: request.createBoard?.name ?? plan.report.source.boardName,
      summary: `imported a board backup from ${plan.report.source.instance}:${counts.tasks} cards, ${counts.updates} updates, ${counts.activity} activity rows, ${counts.timeEntries} time entries, ${counts.statusUpdates} status updates, ${counts.messages} messages, ${counts.rules} rules (off), ${plan.report.skippedCount} skipped`,
      createdAt: Date.now()
    })
  })
}
