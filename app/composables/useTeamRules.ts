// The team rules API (/api/teams/:id/rules). Any member reads the rules; only an owner or
// admin writes. A team rule names a column by NAME (`columnName`) and is the same on every
// board of the team, so these shapes differ from a board rule's only in that key.
import type { RuleRun } from '~/composables/useProjectRules'

export type TeamRuleMode = 'by_name' | 'column_free'

export interface TeamRuleStep {
  kind: string
  columnName?: string
  assigneeId?: string | null
  label?: string
  days?: number
  text?: string
  title?: string
  value?: boolean | string
}

export interface TeamRuleItem {
  id: string
  name: string
  enabled: boolean
  mode: TeamRuleMode
  position: number
  trigger: TeamRuleStep
  conditions: TeamRuleStep[]
  actions: TeamRuleStep[]
  description: string
  lastRun: RuleRun | null
  createdAt: number
  updatedAt: number
}

export interface TeamRuleBody {
  name?: string
  mode: TeamRuleMode
  trigger: TeamRuleStep
  conditions: TeamRuleStep[]
  actions: TeamRuleStep[]
}

export interface TeamRulesList {
  rules: TeamRuleItem[]
  people: { id: string, name: string }[]
  canManage: boolean
  mayChangeVisibility: boolean
}

export function listTeamRules(teamId: string): Promise<TeamRulesList> {
  return $fetch<TeamRulesList>(`/api/teams/${teamId}/rules`)
}

export function createTeamRule(teamId: string, body: TeamRuleBody): Promise<TeamRuleItem> {
  return $fetch<TeamRuleItem>(`/api/teams/${teamId}/rules`, { method: 'POST', body })
}

// Sending only `enabled` is the on/off switch; anything else is a full rule body.
export function updateTeamRule(teamId: string, ruleId: string, body: TeamRuleBody | { enabled: boolean }): Promise<TeamRuleItem> {
  return $fetch<TeamRuleItem>(`/api/teams/${teamId}/rules/${ruleId}`, { method: 'PUT', body })
}

export function deleteTeamRule(teamId: string, ruleId: string): Promise<{ ok: true }> {
  return $fetch<{ ok: true }>(`/api/teams/${teamId}/rules/${ruleId}`, { method: 'DELETE' })
}

export async function listTeamRuleRuns(teamId: string, ruleId: string): Promise<RuleRun[]> {
  const res = await $fetch<{ runs: RuleRun[] }>(`/api/teams/${teamId}/rules/${ruleId}/runs`)
  return res.runs
}
