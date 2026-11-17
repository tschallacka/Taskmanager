// The API paths that need a session. A route not on this list gets no session in its context.
// /api/invitations is deliberately not here: an invite link has to be readable before its recipient has an account.
export const PROTECTED_PREFIXES = [
  '/api/account',
  '/api/settings',
  '/api/ai',
  '/api/chat',
  '/api/teams',
  '/api/projects',
  '/api/tasks',
  '/api/columns',
  '/api/notifications',
  '/api/pins',
  '/api/agent-audit',
  '/api/goals',
  '/api/portfolios',
  '/api/time',
  '/api/timer',
  '/api/customers',
  '/api/admin',
  '/api/github',
  '/api/help',
  '/api/people',
  '/api/shared-with-me',
  '/api/pending-invitations'
]

export function isProtectedApiPath(path: string): boolean {
  return PROTECTED_PREFIXES.some(prefix => path.startsWith(prefix))
}
