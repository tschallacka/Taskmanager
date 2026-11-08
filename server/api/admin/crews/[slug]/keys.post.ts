import { createError } from 'h3'
import { audited, crewBySlug, crewKeysEnv, rotateCrew } from '../../../../utils/crewProvisioning'
import { requireInstanceAdmin } from '../../../../utils/instanceAdmin'

// The instance admin's Crews page gets a crew's new keys and passwords here, the same way the keys route
// (POST /api/crews/:slug/keys) gives them to a key: env text by default, ?format=json for the JSON shape the
// wizard reads and shows once. Same rotation as a rotate, written to the agent audit with the Crews page as the caller.
export default defineEventHandler(async (event) => {
  await requireInstanceAdmin(event)
  const slug = String(getRouterParam(event, 'slug') ?? '')
  const format = getQuery(event).format
  if (format !== undefined && format !== 'env' && format !== 'json') {
    throw createError({ statusCode: 400, message: 'format is env or json.' })
  }
  const caller = { userId: event.context.session.user.id, keyId: null, keyName: 'Crews page' }
  const answer = await audited(caller, 'keys', slug, async () => {
    const crew = await crewBySlug(slug)
    return { result: await rotateCrew(crew), summary: 'made new keys for' }
  })
  setHeader(event, 'Cache-Control', 'no-store')
  if (format === 'json') return answer
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  return crewKeysEnv(answer)
})
