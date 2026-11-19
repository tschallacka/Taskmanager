// Who a project's customer name is shown to: staff or a customer's contact. Staff is decided by team membership (the same test
// as the pinned boards, workspaceTeam in server/utils/workspaces.ts), never by the caller's active team: a member of the
// project's team is staff whichever team they have open. A personal project is staff for its own user only. Pure.

export type ProjectAudience = 'staff' | 'customer'

export function audienceByMembership(
  userId: string,
  memberTeamIds: ReadonlySet<string>,
  project: { userId: string, teamId: string | null }
): ProjectAudience {
  if (project.teamId && memberTeamIds.has(project.teamId)) return 'staff'
  if (!project.teamId && project.userId === userId) return 'staff'
  return 'customer'
}
