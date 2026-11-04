import { requireTeamRole } from '../../../utils/auth-helpers'
import { DEFAULT_COLUMNS, DefaultColumnsError, normaliseDefaultColumns, writeDefaultColumns } from '../../../utils/teamSettings'

/**
 * Sets the columns a new board of this team starts with. Owners and admins only.
 * Boards that already exist keep their columns. An empty list puts the built-in set back.
 */
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  await requireTeamRole(event, teamId)
  const body = await readBody<{ defaultColumns?: unknown }>(event)
  let columns: string[] | null
  try {
    columns = normaliseDefaultColumns(body.defaultColumns)
  } catch (e) {
    if (e instanceof DefaultColumnsError) throw createError({ statusCode: 400, message: e.message })
    throw e
  }
  await writeDefaultColumns(teamId, columns)
  return { defaultColumns: columns ?? [...DEFAULT_COLUMNS], usingBuiltIn: columns === null }
})
