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
export function mayCreateProjects(input: { teamCount: number, contact: boolean }): boolean {
  return !(input.teamCount === 0 && input.contact)
}

/** Whether the PROJECTS list shows a project: a person with no team sees their shared projects in their group only. */
export function panelListsProject(input: { teamCount: number, sharedIds: Set<string> }, projectId: string): boolean {
  return !(input.teamCount === 0 && input.sharedIds.has(projectId))
}
