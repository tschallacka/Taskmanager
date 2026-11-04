// The crews working on a team's boards (/api/teams/:id/crews). Any member sees the links; an
// owner or admin gives a board a crew (only one they made themselves) and takes it off again.
export interface TeamCrewLink {
  id: string
  crewId: string
  crewName: string
  crewSlug: string
  crewTeamId: string
  // Whether the caller belongs to the crew's team, the only people who can open its board.
  canOpen: boolean
  crewDisabled: boolean
  projectId: string
  projectName: string
  shadowProjectId: string
  shadowProjectName: string
  createdAt: number
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
