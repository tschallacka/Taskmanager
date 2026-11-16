// The name the workspace switcher shows. While the active team is still loading, it shows a neutral label rather than
// "Personal Workspace": the boards of a team are already on screen by then, and the label must not contradict them.
export function workspaceLabel(input: { teamName: string | null, pending: boolean }): string {
  if (input.teamName) return input.teamName
  return input.pending ? 'Loading workspace' : 'Personal Workspace'
}
