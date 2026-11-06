// The form side of a team key, shared by the team Keys panel and its test: what the form sends to
// PATCH /api/teams/:id/keys/:keyId, and what a key's limit reads as in the form.

export type TeamKeyReach = 'team' | 'customer' | 'project'

export interface TeamKeyLimit {
  type: TeamKeyReach
  id: string
  name: string | null
}

export interface TeamKeyForm {
  name: string
  write: boolean
  reach: TeamKeyReach
  customerId?: string
  projectId?: string
}

/** The scopes a key gets: read, and write when the person ticked it. */
export function teamKeyScopes(write: boolean): string[] {
  return write ? ['boards:read', 'boards:write'] : ['boards:read']
}

/** Whether the form can be saved: a name, and the customer or board the reach names. */
export function teamKeyFormValid(form: TeamKeyForm): boolean {
  if (!form.name.trim()) return false
  if (form.reach === 'customer') return Boolean(form.customerId)
  if (form.reach === 'project') return Boolean(form.projectId)
  return true
}

/** The body PATCH /api/teams/:id/keys/:keyId takes: only the reach the form names keeps its id. */
export function teamKeyPatchBody(form: TeamKeyForm) {
  return {
    name: form.name.trim(),
    scopes: teamKeyScopes(form.write),
    customerId: form.reach === 'customer' ? form.customerId ?? null : null,
    projectId: form.reach === 'project' ? form.projectId ?? null : null
  }
}

/** The form a key's current permissions and limit start from. */
export function teamKeyFormOf(key: { name: string, scopes: string[], limit: TeamKeyLimit }): TeamKeyForm {
  return {
    name: key.name,
    write: key.scopes.includes('boards:write'),
    reach: key.limit.type,
    customerId: key.limit.type === 'customer' ? key.limit.id : undefined,
    projectId: key.limit.type === 'project' ? key.limit.id : undefined
  }
}
