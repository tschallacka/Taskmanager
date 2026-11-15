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
