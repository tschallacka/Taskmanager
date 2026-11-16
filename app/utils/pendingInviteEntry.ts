// Where a person with a pending invitation link goes on the projects page: back to the invitation, while they have no
// team, no board of their own, and did not ask for a new project.

export function pendingInviteEntry(input: { asksNew: boolean, hasProjects: boolean, teamCount: number, inviteToken: string | null }): string | null {
  if (input.asksNew || input.hasProjects || input.teamCount > 0 || !input.inviteToken) return null
  return `/invite/${encodeURIComponent(input.inviteToken)}`
}
