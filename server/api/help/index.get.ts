import { getUserActiveTeamId } from '../../utils/auth-helpers'
import { searchViewerHelp, viewerDocs } from '../../utils/helpStore'

// The help pages this person may read, listed without their text, or, with ?q=, the ones that answer
// a question. What they may not do is not here: help follows permissions.
export default defineEventHandler(async (event) => {
  const viewer = { userId: event.context.session.user.id, teamId: await getUserActiveTeamId(event) }
  const query = String(getQuery(event).q ?? '').trim()
  if (query) return { hits: await searchViewerHelp(viewer, query, 20) }
  const docs = await viewerDocs(viewer)
  return { docs: docs.map(({ slug, title, summary, group, topics }) => ({ slug, title, summary, group, topics })) }
})
