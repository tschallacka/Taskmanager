// A team rule: one rule for every board of a team. A board's column ids belong to that board,
// so a team rule cannot name them. Each rule says how it refers to columns:
//   by_name      columns by their NAME ("when moved to Done"), people from the team. On a board
//                with no column of that name the rule does not run.
//   column_free  no columns and no particular person, only what every board has.
// The checks reuse the board rule model: a rule is translated to board rule terms, checked by
// validateRule, and translated back. Pure, with no database, so it tests on its own.
import { describeRule, validateRule } from './ruleSpec'
import type { Action, Condition, Rule, RuleNames, Trigger } from './ruleSpec'

export const TEAM_RULE_MODES = ['by_name', 'column_free'] as const
export type TeamRuleMode = typeof TEAM_RULE_MODES[number]

export const MAX_RULE_COLUMN_NAME_LENGTH = 40
/** Team rules are held to the same count a board is. */
export const MAX_RULES_PER_TEAM = 50

export type TeamTrigger = Exclude<Trigger, { kind: 'task_moved' }> | { kind: 'task_moved', columnName: string }
export type TeamCondition = Exclude<Condition, { kind: 'in_column' }> | { kind: 'in_column', columnName: string }
export type TeamAction = Exclude<Action, { kind: 'move_to_column' }> | { kind: 'move_to_column', columnName: string }

export interface TeamRule {
  name: string
  enabled: boolean
  mode: TeamRuleMode
  trigger: TeamTrigger
  conditions: TeamCondition[]
  actions: TeamAction[]
}

export interface TeamRuleContext {
  /** The people a by_name rule may name: the team's members. */
  memberIds: string[]
  /** True for the team's owner only: other staff may not let a rule change visibility. */
  mayChangeVisibility: boolean
}

export type ValidateTeamResult = { ok: true, rule: TeamRule } | { ok: false, problems: string[] }

type Obj = Record<string, unknown>

const isObject = (value: unknown): value is Obj => typeof value === 'object' && value !== null && !Array.isArray(value)

/** How column names are compared: ignoring case and runs of spaces. */
export function columnKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

const PREFIX = 'name:'

export function isTeamRuleMode(value: unknown): value is TeamRuleMode {
  return typeof value === 'string' && (TEAM_RULE_MODES as readonly string[]).includes(value)
}

// A column name as the rule stores it, or null when it is not a usable name.
function readColumnName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim().replace(/\s+/g, ' ')
  return name.length > 0 && name.length <= MAX_RULE_COLUMN_NAME_LENGTH ? name : null
}

const COLUMN_FREE_REFUSAL = (what: string) => `A column-free rule cannot use ${what}. Switch the rule to "by name", or pick something that does not need a column or a person.`

// What a column-free rule may not contain, named for the person who wrote it.
function columnFreeProblems(input: Obj): string[] {
  const problems: string[] = []
  const trigger = isObject(input.trigger) ? input.trigger : null
  if (trigger?.kind === 'task_moved') problems.push(COLUMN_FREE_REFUSAL('the trigger "a task is moved to a column"'))
  if (trigger?.kind === 'task_assigned' && trigger.assigneeId !== undefined) problems.push(COLUMN_FREE_REFUSAL('the trigger "assigned to a particular person"'))
  for (const raw of Array.isArray(input.conditions) ? input.conditions : []) {
    if (!isObject(raw)) continue
    if (raw.kind === 'in_column') problems.push(COLUMN_FREE_REFUSAL('the condition "the task is in a column"'))
    if (raw.kind === 'assigned_to' && raw.assigneeId !== null) problems.push(COLUMN_FREE_REFUSAL('the condition "assigned to a particular person"'))
  }
  for (const raw of Array.isArray(input.actions) ? input.actions : []) {
    if (!isObject(raw)) continue
    if (raw.kind === 'move_to_column') problems.push(COLUMN_FREE_REFUSAL('the action "move it to a column"'))
    if (raw.kind === 'assign') problems.push(COLUMN_FREE_REFUSAL('the action "assign it to a person"'))
  }
  return problems
}

/**
 * Checks a team rule a person or an agent wrote and returns it in the normal form, or the
 * list of things to fix. Unknown fields are dropped, as for a board rule.
 */
export function validateTeamRule(input: unknown, context: TeamRuleContext): ValidateTeamResult {
  if (!isObject(input)) {
    return { ok: false, problems: ['A rule must have a trigger, optional conditions and at least one action'] }
  }
  if (!isTeamRuleMode(input.mode)) {
    return { ok: false, problems: [`Pick how the rule refers to columns: ${TEAM_RULE_MODES.join(' or ')}`] }
  }
  const mode = input.mode

  if (mode === 'column_free') {
    const refused = columnFreeProblems(input)
    if (refused.length > 0) return { ok: false, problems: refused }
    const checked = validateRule(input, { columnIds: [], memberIds: [], mayChangeVisibility: context.mayChangeVisibility })
    if (!checked.ok) return checked
    return { ok: true, rule: { ...checked.rule, mode, trigger: checked.rule.trigger as TeamTrigger, conditions: checked.rule.conditions as TeamCondition[], actions: checked.rule.actions as TeamAction[] } }
  }

  // by_name: each column name becomes a stand-in id the board rule model accepts, and is turned
  // back into the name afterwards. A step keeps its own spelling of the name.
  const used = new Set<string>()
  const stand = (raw: unknown): unknown => {
    if (!isObject(raw)) return raw
    const isColumnStep = (raw.kind === 'task_moved' || raw.kind === 'in_column' || raw.kind === 'move_to_column')
    if (!isColumnStep) return raw
    const name = readColumnName(raw.columnName)
    if (name === null) return { ...raw, columnId: undefined }
    used.add(name)
    return { ...raw, columnId: PREFIX + name }
  }
  const translated: Obj = {
    ...input,
    trigger: stand(input.trigger),
    conditions: Array.isArray(input.conditions) ? input.conditions.map(stand) : input.conditions,
    actions: Array.isArray(input.actions) ? input.actions.map(stand) : input.actions
  }
  const checked = validateRule(translated, {
    columnIds: [...used].map(name => PREFIX + name),
    memberIds: context.memberIds,
    mayChangeVisibility: context.mayChangeVisibility
  })
  if (!checked.ok) {
    return {
      ok: false,
      problems: checked.problems.map(problem => problem
        .replace(/^Choose the column for /, `Write the column name (1 to ${MAX_RULE_COLUMN_NAME_LENGTH} characters) for `)
        .replace('Pick someone who is a member of this project', 'Pick someone who is a member of this team'))
    }
  }

  const nameOf = (columnId: string): string => columnId.slice(PREFIX.length)
  const { trigger, conditions, actions } = checked.rule
  return {
    ok: true,
    rule: {
      name: checked.rule.name,
      enabled: checked.rule.enabled,
      mode,
      trigger: trigger.kind === 'task_moved' ? { kind: 'task_moved', columnName: nameOf(trigger.columnId) } : trigger as TeamTrigger,
      conditions: conditions.map(condition => condition.kind === 'in_column' ? { kind: 'in_column' as const, columnName: nameOf(condition.columnId) } : condition as TeamCondition),
      actions: actions.map(action => action.kind === 'move_to_column' ? { kind: 'move_to_column' as const, columnName: nameOf(action.columnId) } : action as TeamAction)
    }
  }
}

/**
 * The team rule as an ordinary rule for one board, with each column name turned into that board's
 * column id. Null when the board has no column of one of the names: the rule does not run there.
 */
export function materialiseTeamRule(rule: TeamRule, columns: { id: string, name: string }[]): Rule | null {
  const byName = new Map<string, string>()
  for (const column of columns) {
    const key = columnKey(column.name)
    if (!byName.has(key)) byName.set(key, column.id)
  }
  let missing = false
  const idOf = (name: string): string => {
    const id = byName.get(columnKey(name))
    if (id === undefined) missing = true
    return id ?? ''
  }
  const trigger: Trigger = rule.trigger.kind === 'task_moved' ? { kind: 'task_moved', columnId: idOf(rule.trigger.columnName) } : rule.trigger
  const conditions: Condition[] = rule.conditions.map(condition => condition.kind === 'in_column' ? { kind: 'in_column', columnId: idOf(condition.columnName) } : condition)
  const actions: Action[] = rule.actions.map(action => action.kind === 'move_to_column' ? { kind: 'move_to_column', columnId: idOf(action.columnName) } : action)
  return missing ? null : { name: rule.name, enabled: rule.enabled, trigger, conditions, actions }
}

/** One plain sentence for a team rule: the columns read as quoted names, whichever board it runs on. */
export function describeTeamRule(rule: TeamRule, personName: (id: string) => string): string {
  const asBoardRule: Rule = {
    name: rule.name,
    enabled: rule.enabled,
    trigger: rule.trigger.kind === 'task_moved' ? { kind: 'task_moved', columnId: rule.trigger.columnName } : rule.trigger,
    conditions: rule.conditions.map(condition => condition.kind === 'in_column' ? { kind: 'in_column' as const, columnId: condition.columnName } : condition),
    actions: rule.actions.map(action => action.kind === 'move_to_column' ? { kind: 'move_to_column' as const, columnId: action.columnName } : action)
  }
  const names: RuleNames = { column: name => `a column called "${name}"`, person: personName }
  return describeRule(asBoardRule, names)
}
