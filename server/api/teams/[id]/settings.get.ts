import { requireTeamRole } from '../../../utils/auth-helpers'
import { DEFAULT_COLUMNS, readDefaultColumns } from '../../../utils/teamSettings'

/** The team's settings. Any member may read them; the page shows them to everyone. */
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  await requireTeamRole(event, teamId, ['owner', 'admin', 'member'])
  const own = await readDefaultColumns(teamId)
  return {
    defaultColumns: own ?? [...DEFAULT_COLUMNS],
    // Tells the page whether the team chose these or they are the built-in set.
    usingBuiltIn: own === null,
    builtInColumns: [...DEFAULT_COLUMNS]
  }
})
