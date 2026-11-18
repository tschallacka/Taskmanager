// The account download (Art. 20, card mwjfpr8phz5gi4bdjqa). It reads what EXPORT_RULES allows for one person, and nothing
// else: the listed fields of each table, for the rows whose owner column is the person. Each section holds at most
// EXPORT_ROW_LIMIT rows; a section past the limit says so in `truncated` and holds the first rows only. Names of teams and
// boards are joined for the membership rows, so the person sees what the membership is in.
import { count, eq, inArray } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { db } from '../db'
import * as schema from '../db/schema'
import { EXPORT_RULES } from './accountRules'

/** The most rows one section holds. */
export const EXPORT_ROW_LIMIT = 50_000

export interface ExportOptions {
  /** Rows per section; the default is EXPORT_ROW_LIMIT. Tests set a small one. */
  rowLimit?: number
}

type Row = Record<string, unknown>
type AnyTable = Parameters<typeof getTableConfig>[0]

function tableNamed(name: string): { table: AnyTable, config: ReturnType<typeof getTableConfig> } {
  for (const value of Object.values(schema)) {
    let config: ReturnType<typeof getTableConfig>
    try {
      config = getTableConfig(value as AnyTable)
    } catch {
      continue
    }
    if (config.name === name) return { table: value as AnyTable, config }
  }
  throw new Error(`no table named ${name}`)
}

/** A section the row limit cut: its name, the limit and the full number of rows the person has in it. */
export interface TruncatedSection {
  section: string
  limit: number
  total: number
}

// The rows of one table whose owner column is `ownerId`, with only the listed fields (the database's names).
async function pick(name: string, by: string, fields: string[], ownerId: string, section: string, limit: number, truncated: TruncatedSection[]): Promise<Row[]> {
  const { table, config } = tableNamed(name)
  const owner = config.columns.find(column => column.name === by)
  if (!owner) throw new Error(`${name}.${by} is not a column`)
  const selection: Record<string, unknown> = {}
  for (const field of fields) {
    const column = config.columns.find(candidate => candidate.name === field)
    if (!column) throw new Error(`${name}.${field} is not a column`)
    selection[field] = column
  }
  const found = await db.select(selection as never).from(table as never).where(eq(owner as never, ownerId)).limit(limit + 1)
  if (found.length > limit) {
    // The page is one row past the limit, so the full count is asked for on its own, to tell the person how much was cut.
    const [counted] = await db.select({ total: count() }).from(table as never).where(eq(owner as never, ownerId)) as Row[]
    truncated.push({ section, limit, total: Number(counted?.total ?? found.length) })
  }
  return (found as Row[]).slice(0, limit)
}

// The names of rows of a table by id, for the joins; an empty list asks nothing.
async function namesOf(name: string, ids: unknown[]): Promise<Map<unknown, unknown>> {
  const names = new Map<unknown, unknown>()
  const wanted = [...new Set(ids.filter(id => id !== null && id !== undefined))]
  if (wanted.length === 0) return names
  const { table, config } = tableNamed(name)
  const idColumn = config.columns.find(column => column.name === 'id')
  const nameColumn = config.columns.find(column => column.name === 'name')
  if (!idColumn || !nameColumn) throw new Error(`${name} has no id and name`)
  const rows = await db.select({ id: idColumn, name: nameColumn } as never).from(table as never).where(inArray(idColumn as never, wanted as never)) as Row[]
  for (const row of rows) names.set(row.id, row.name)
  return names
}

function rule(name: string): { by: string, fields: string[] } {
  const found = EXPORT_RULES[name]
  if (!found || found.kind !== 'export') throw new Error(`${name} is not exported`)
  return { by: found.by, fields: found.fields }
}

export interface AccountExport {
  format: 'taskmanager-account-export'
  version: 1
  exported_at: string
  account: { name: unknown, email: unknown, email_verified: unknown, created_at: unknown, addresses: Row[] }
  settings: { colours: Row[], notifications: Row[] }
  memberships: { teams: Row[], boards: Row[], guest_boards: Row[] }
  owned_boards: Row[]
  authored: { tasks: Row[], comments: Row[], time_entries: Row[], status_updates: Row[] }
  /** True when at least one section was cut at the row limit. */
  truncated: boolean
  /** The sections that were cut, with the limit and the full row count of each. */
  truncated_sections: TruncatedSection[]
}

/** The person's download: what they own, what they are a member of, and what they wrote. */
export async function exportAccount(userId: string, options: ExportOptions = {}): Promise<AccountExport> {
  const limit = options.rowLimit ?? EXPORT_ROW_LIMIT
  const truncated: TruncatedSection[] = []
  const take = (name: string, section: string): Promise<Row[]> => {
    const { by, fields } = rule(name)
    return pick(name, by, fields, userId, section, limit, truncated)
  }

  const [person] = await pick('user', 'id', ['name', 'email', 'email_verified', 'created_at'], userId, 'account', 1, [])
  const addresses = await take('user_email', 'account.addresses')
  const colours = await take('user_settings', 'settings.colours')
  const notifications = await take('notification_preferences', 'settings.notifications')

  const teamRows = await take('member', 'memberships.teams')
  const teamNames = await namesOf('organization', teamRows.map(row => row.organization_id))
  const boardRows = await take('project_members', 'memberships.boards')
  const guestRows = await take('project_guests', 'memberships.guest_boards')
  const boardNames = await namesOf('projects', [...boardRows, ...guestRows].map(row => row.project_id))
  const owned = await take('projects', 'owned_boards')

  const tasks = await take('project_tasks', 'authored.tasks')
  const comments = await take('task_comments', 'authored.comments')
  const timeEntries = await take('time_entries', 'authored.time_entries')
  const statusUpdates = await take('project_status_updates', 'authored.status_updates')

  return {
    format: 'taskmanager-account-export',
    version: 1,
    exported_at: new Date().toISOString(),
    account: {
      name: person?.name ?? null,
      email: person?.email ?? null,
      email_verified: person?.email_verified ?? null,
      created_at: person?.created_at ?? null,
      addresses
    },
    settings: { colours, notifications },
    memberships: {
      teams: teamRows.map(row => ({ ...row, team_name: teamNames.get(row.organization_id) ?? null })),
      boards: boardRows.map(row => ({ ...row, board_name: boardNames.get(row.project_id) ?? null })),
      guest_boards: guestRows.map(row => ({ ...row, board_name: boardNames.get(row.project_id) ?? null }))
    },
    owned_boards: owned,
    authored: { tasks, comments, time_entries: timeEntries, status_updates: statusUpdates },
    truncated: truncated.length > 0,
    truncated_sections: truncated
  }
}
