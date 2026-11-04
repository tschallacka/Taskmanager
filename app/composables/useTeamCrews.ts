// The crews working on a team's boards (/api/teams/:id/crews). Any member sees the links; an
// owner or admin gives a board a crew (only one they made themselves) and takes it off again.
export interface TeamCrewLink {
  id: string
  crewId: string
  crewName: string
  crewSlug: string
  crewTeamId: string
  // Whether the caller belongs to the crew's team: they open its board with full access.
  // Everyone else on the real board's team reads it and cannot change it.
  inCrewTeam: boolean
  crewDisabled: boolean
  projectId: string
  projectName: string
  shadowProjectId: string
  shadowProjectName: string
  createdAt: number
  // The caller made the crew: only they fork it or take it off the board.
  mine: boolean
  forks: TeamCrewFork[]
}

export interface TeamCrewsList {
  links: TeamCrewLink[]
  canAttach: boolean
  // What an owner or admin may pick from: the crews they made, and the team's boards.
  crews: { id: string, slug: string, name: string }[]
  boards: { id: string, name: string }[]
}

export function listTeamCrews(teamId: string): Promise<TeamCrewsList> {
  return $fetch<TeamCrewsList>(`/api/teams/${teamId}/crews`)
}

export function attachTeamCrew(teamId: string, crewId: string, projectId: string): Promise<{ id: string, shadowProjectId: string }> {
  return $fetch<{ id: string, shadowProjectId: string }>(`/api/teams/${teamId}/crews`, { method: 'POST', body: { crewId, projectId } })
}

export function detachTeamCrew(teamId: string, linkId: string): Promise<{ ok: true }> {
  return $fetch<{ ok: true }>(`/api/teams/${teamId}/crews/${linkId}`, { method: 'DELETE' })
}

// A member of the crew forked for one board: its own account and a key limited to the crew's board.
export interface TeamCrewFork {
  key: string
  name: string
  agentType: string
  keyLastUsed: number | null
}

// What a fork or a rotate answers with. The passwords and keys are in it once and are not kept.
export interface ForkedMember {
  key: string
  name: string
  agentType: string
  email: string
  password: string
  apiKey: string
}

export interface ForkResult {
  base: string
  crew: { slug: string, name: string }
  board: { id: string, name: string }
  shadowBoard: { id: string }
  members: ForkedMember[]
}

export function forkTeamCrew(teamId: string, linkId: string, rotate: boolean): Promise<ForkResult> {
  return $fetch<ForkResult>(`/api/teams/${teamId}/crews/${linkId}/fork`, { method: 'POST', body: { rotate } })
}

export function unforkTeamCrew(teamId: string, linkId: string): Promise<{ ok: true }> {
  return $fetch<{ ok: true }>(`/api/teams/${teamId}/crews/${linkId}/fork`, { method: 'DELETE' })
}
