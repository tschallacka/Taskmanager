import { getUserActiveTeamId } from '../../utils/auth-helpers'
import { viewerDoc } from '../../utils/helpStore'

// One help page, as this person may read it. A page they may not read is answered as missing, so a
// title is not given away to someone who could not open it.
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const viewer = { userId: event.context.session.user.id, teamId: await getUserActiveTeamId(event) }
  const doc = await viewerDoc(viewer, slug)
  if (!doc) throw createError({ statusCode: 404, message: 'No such help page' })
  return doc
})
