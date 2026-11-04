// What the person asking for help may do, worked out the way the rest of the app does, so the help they
// read is never about something they could not do. A browser session and an API key (so Sprocket too)
// both come through here; a key holds what its person holds, less what its permissions leave out.
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { member, user } from '../db/schema'
import type { ApiKeyScope } from '../db/schema'
import { customerIdsOf } from './auth-helpers'
import type { HelpPermission } from '#shared/utils/helpDocs'

export interface HelpViewer {
  userId: string
  /** The workspace they are in: a team id, or null for their own. */
  teamId: string | null
  /** Set for an API key: the permissions it carries. A browser session leaves it out. */
  scopes?: readonly ApiKeyScope[]
}

export async function helpPermissionsOf(viewer: HelpViewer): Promise<Set<HelpPermission>> {
  const held = new Set<HelpPermission>()
  const [account] = await db.select({ isInstanceAdmin: user.isInstanceAdmin }).from(user).where(eq(user.id, viewer.userId))
  const role = viewer.teamId
    ? (await db.select({ role: member.role }).from(member).where(and(eq(member.organizationId, viewer.teamId), eq(member.userId, viewer.userId))))[0]?.role
    : undefined

  // In a team they are staff. On their own workspace they are staff too, unless they only log in as a
  // contact of a customer, who sees what is shared with customers and nothing of how the team works.
  const contactOnly = !role && (await customerIdsOf(viewer.userId)).length > 0
  if (contactOnly) held.add('customer')
  else held.add('staff')

  if (role === 'owner' || role === 'admin') held.add('team-admin')
  if (role === 'owner') held.add('team-owner')
  if (account?.isInstanceAdmin) held.add('instance-admin')

  const scopes = viewer.scopes
  const keyHas = (scope: ApiKeyScope) => !scopes || scopes.includes(scope)
  if (keyHas('boards:write')) held.add('write')
  if (!contactOnly && (!scopes || scopes.includes('secrets:read') || scopes.includes('secrets:write'))) held.add('secrets')
  if (account?.isInstanceAdmin && keyHas('crews:manage')) held.add('crews')
  return held
}
