import { and, eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { apiKeys } from '../../../../db/schema'
import { requireTeamRole } from '../../../../utils/auth-helpers'

/** Revokes any key that works in this team, whoever owns it. Owners and admins only. */
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  const keyId = getRouterParam(event, 'keyId')!
  await requireTeamRole(event, teamId)

  const [removed] = await db.delete(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.teamId, teamId)))
    .returning({ id: apiKeys.id })
  if (!removed) throw createError({ statusCode: 404, message: 'No such key in this team' })
  return { ok: true }
})
