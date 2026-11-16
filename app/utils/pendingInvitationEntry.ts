// Where a person with an invitation they never accepted goes on a later sign-in: the pending invitations, which show
// 'Accept invitation'. Only with no team and no board of their own, and not asking for a new project.

export function pendingInvitationEntry(input: { asksNew: boolean, hasProjects: boolean, teamCount: number, pendingCount: number }): string | null {
  if (input.asksNew || input.hasProjects || input.teamCount > 0 || input.pendingCount === 0) return null
  // Not under /invite: that path is the token route, and 'pending' would be read as a token.
  return '/pending-invitations'
}
