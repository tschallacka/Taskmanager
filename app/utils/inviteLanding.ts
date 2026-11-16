// Where an accepted invitation lands. A team and a board keep their working page. A customer goes to the one
// project shared with them, or to the list of shared projects, which says so when nothing is shared yet.

export type InviteAnswer
  = | { kind: 'team' }
    | { kind: 'board', projectId: string }
    | { kind: 'customer', sharedProjectIds: string[] }

export const SHARED_LIST_PATH = '/shared-with-me'

export function landingFor(answer: InviteAnswer): string {
  if (answer.kind === 'team') return '/projects'
  if (answer.kind === 'board') return `/projects/${answer.projectId}`
  if (answer.sharedProjectIds.length === 1) return `/projects/${answer.sharedProjectIds[0]}`
  return SHARED_LIST_PATH
}
