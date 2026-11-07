// The rules of a token (an API key that a person connects an agent with): the refusals a stale or
// cut-off token gets, and what it may do on each board. Pure, with no database, so the rules are
// tested on their own. The database side lives in connectTokens.ts.
import { createError } from 'h3'
import { API_KEY_SCOPES } from '../db/schema'
import type { ApiKeyScope } from '../db/schema'

/** Why a secret stopped working. A secret never issued gets the plain 401 instead. */
export type TokenRefusalCode = 'token_regenerated' | 'token_revoked' | 'token_expired'

// The same closing line for every refusal: an agent that hits one passes it on, and does not retry.
const AGENT_LINE = 'If you are an agent or subagent, pass this along to your main agent so they can ask the user for a new token. Do not retry with this token.'

/** The plain text an agent reads first in the body of a refused call. */
export const TOKEN_REFUSAL_MESSAGES: Record<TokenRefusalCode, string> = {
  token_regenerated: `This token has been regenerated. Please enter the new token. ${AGENT_LINE}`,
  token_revoked: `This token has been revoked and no longer works. Please enter a new token. ${AGENT_LINE}`,
  token_expired: `This token has expired. Please enter a new token. ${AGENT_LINE}`
}

/** A 401 that names the reason (the code is in data.code) and carries the sentence for the user. */
export function tokenRefusal(code: TokenRefusalCode) {
  return createError({
    statusCode: 401,
    statusMessage: 'Unauthorized',
    message: TOKEN_REFUSAL_MESSAGES[code],
    data: { code }
  })
}

/** Whether a token has run past its expiry at `now`. A token with no expiry never runs out. */
export function isTokenExpired(expiresAt: number | null | undefined, now: number): boolean {
  return Boolean(expiresAt) && (expiresAt as number) <= now
}

/** A single board's grant, as the owner ticked it: the permissions the token has on that board. */
export interface BoardScopeRow {
  projectId: string
  scope: string
}

/** Rows from the database, grouped per board. Anything that is not a known permission is dropped. */
export function boardScopesOf(rows: BoardScopeRow[]): Record<string, ApiKeyScope[]> {
  const grants: Record<string, ApiKeyScope[]> = {}
  for (const row of rows) {
    if (!(API_KEY_SCOPES as readonly string[]).includes(row.scope)) continue
    const list = grants[row.projectId] ?? []
    if (!list.includes(row.scope as ApiKeyScope)) list.push(row.scope as ApiKeyScope)
    grants[row.projectId] = list
  }
  return grants
}

/**
 * What the token may do on one board. Without per-board grants (`boardScopes` is null) every board gets
 * the token's own permissions. With them, a board gets only the permissions ticked for it, and never more
 * than the token carries overall.
 */
export function scopesOnBoard(
  tokenScopes: ApiKeyScope[],
  boardScopes: Record<string, ApiKeyScope[]> | null,
  projectId: string
): ApiKeyScope[] {
  if (!boardScopes) return tokenScopes
  const granted = boardScopes[projectId] ?? []
  return tokenScopes.filter(scope => granted.includes(scope))
}

/**
 * The grants for a board added to an older token: the permissions of another board of that token, copied.
 * Returns the rows to store (the whole token's grants with the new board added), without touching the others.
 */
export function copyBoardScopes(
  grants: Record<string, ApiKeyScope[]>,
  fromProjectId: string,
  toProjectId: string
): Record<string, ApiKeyScope[]> {
  const copied = { ...grants }
  copied[toProjectId] = [...(grants[fromProjectId] ?? [])]
  return copied
}

/**
 * The boards a call with `scope` may act on, for a token with per-board grants. Null when the token has none
 * (its own scopes apply to every board, so nothing narrows). Otherwise the ids of the boards whose grant
 * includes `scope`; a call with no scope reaches no board at all.
 */
export function boardsGranting(
  tokenScopes: ApiKeyScope[],
  boardScopes: Record<string, ApiKeyScope[]> | null | undefined,
  scope: ApiKeyScope | undefined
): string[] | null {
  if (!boardScopes) return null
  if (!scope) return []
  return Object.keys(boardScopes).filter(projectId => scopesOnBoard(tokenScopes, boardScopes, projectId).includes(scope))
}
