// What the team rules routes share: loading a team's rules, who the rule may name, and how a
// stored rule reads back. Any member reads the team's rules; only an owner or admin changes them,
// and only the team's owner may let a rule change task visibility (see teamRuleSpec.ts).
import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { member, teamRuleRuns, teamRules, user } from '../db/schema'
import type { TeamRuleRow } from '../db/schema'
import { runView } from './ruleStore'
import { describeTeamRule, isTeamRuleMode, MAX_RULES_PER_TEAM } from './teamRuleSpec'
import type { TeamAction, TeamCondition, TeamRule, TeamRuleContext, TeamTrigger } from './teamRuleSpec'

export interface TeamPerson {
  id: string
  name: string
  role: string
}

export interface TeamRuleFrame {
  context: TeamRuleContext
  people: TeamPerson[]
  personName: (id: string) => string
}

/** The team's people, read once per request: who a by-name rule may name, and whether the caller owns the team. */
export async function loadTeamRuleFrame(teamId: string, userId: string): Promise<TeamRuleFrame> {
  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email, role: member.role })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, teamId))
  const people = rows.map(row => ({ id: row.id, name: row.name || row.email, role: row.role }))
  const names = new Map(people.map(person => [person.id, person.name]))
  const caller = people.find(person => person.id === userId)
  return {
    context: {
      memberIds: people.map(person => person.id),
      mayChangeVisibility: Boolean(caller?.role.split(',').includes('owner'))
    },
    people,
    personName: id => names.get(id) ?? 'someone who is no longer on the team'
  }
}

export async function loadTeamRules(teamId: string): Promise<TeamRuleRow[]> {
  return db.select().from(teamRules).where(eq(teamRules.teamId, teamId)).orderBy(asc(teamRules.position), asc(teamRules.createdAt))
}

/** The position for a rule added at the end of the list, with room left between rules. */
export async function nextTeamRulePosition(teamId: string): Promise<number> {
  const [last] = await db.select({ position: teamRules.position }).from(teamRules)
    .where(eq(teamRules.teamId, teamId)).orderBy(desc(teamRules.position)).limit(1)
  return (last?.position ?? 0) + 1000
}

export function teamRuleLimitMessage(count: number): string | null {
  if (count < MAX_RULES_PER_TEAM) return null
  return `A team can hold at most ${MAX_RULES_PER_TEAM} rules, and it already has ${count}. Remove or switch off a rule before adding another.`
}

/** The rule as it is stored, in the shape the team rule model checks. */
export function storedTeamRule(row: TeamRuleRow): TeamRule {
  return {
    name: row.name,
    enabled: row.enabled,
    mode: isTeamRuleMode(row.mode) ? row.mode : 'by_name',
    trigger: row.trigger as TeamTrigger,
    conditions: row.conditions as TeamCondition[],
    actions: row.actions as TeamAction[]
  }
}

/** The columns a team rule insert or update writes, from a rule the model has checked. */
export function teamRuleValues(rule: TeamRule) {
  return { name: rule.name, enabled: rule.enabled, mode: rule.mode, trigger: rule.trigger, conditions: rule.conditions, actions: rule.actions }
}

export async function lastTeamRunOf(ruleId: string) {
  const [run] = await db.select().from(teamRuleRuns).where(eq(teamRuleRuns.ruleId, ruleId)).orderBy(desc(teamRuleRuns.createdAt)).limit(1)
  return run ? runView(run) : null
}

export function teamRuleView(row: TeamRuleRow, personName: (id: string) => string, lastRun: ReturnType<typeof runView> | null) {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    mode: row.mode,
    position: row.position,
    trigger: row.trigger,
    conditions: row.conditions,
    actions: row.actions,
    description: describeTeamRule(storedTeamRule(row), personName),
    lastRun,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

/** Only the team's own rows: a rule id from another team is simply not found. */
export async function findTeamRuleRow(teamId: string, ruleId: string): Promise<TeamRuleRow | undefined> {
  const [row] = await db.select().from(teamRules).where(and(eq(teamRules.id, ruleId), eq(teamRules.teamId, teamId)))
  return row
}
