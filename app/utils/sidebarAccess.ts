// What the sidebar shows for a person by what they can reach. Team items show only for a person who is a member
// of a team. The projects shared with a customer contact show as a group named after the organisation.

export interface SharedGroupInput {
  organizationName: string
  projects: { id: string, name: string }[]
}

export interface SidebarAccess {
  teamItems: boolean
  groups: { label: string, projects: { id: string, name: string }[] }[]
}

export function sidebarAccess(input: { teamCount: number, sharedGroups: SharedGroupInput[] }): SidebarAccess {
  return {
    teamItems: input.teamCount > 0,
    groups: input.sharedGroups.map(group => ({ label: group.organizationName, projects: group.projects }))
  }
}

/** A person with no team and nothing of their own to see is not offered Create one (a contact only follows boards). */
export function mayCreateProjects(input: { teamCount: number, contact: boolean, teamsPending?: boolean }): boolean {
  // While the teams load, nothing is offered: the answer is not known yet.
  if (input.teamsPending) return false
  return !(input.teamCount === 0 && input.contact)
}

/**
 * Whether the PROJECTS list shows a project: a person with no team sees their shared projects in their group only.
 * While the teams load, every project stays listed (as the sidebar keeps its team items while loading).
 */
export function panelListsProject(input: { teamCount: number, sharedIds: Set<string>, teamsPending?: boolean }, projectId: string): boolean {
  if (input.teamsPending) return true
  return !(input.teamCount === 0 && input.sharedIds.has(projectId))
}
