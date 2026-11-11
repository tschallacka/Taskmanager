import { addCrewPeople, audited, crewBySlug, parsePeopleKeys } from '../../../../utils/crewProvisioning'
import { requireInstanceAdmin } from '../../../../utils/instanceAdmin'

// The instance admin's Crews page adds a crew's missing people here, the same way the crew API does
// (POST /api/crews/:slug/people): the keys of the new people only, nobody else rotated. Written to the agent audit with
// the Crews page as the caller.
export default defineEventHandler(async (event) => {
  await requireInstanceAdmin(event)
  const slug = String(getRouterParam(event, 'slug') ?? '')
  const body = await readBody(event).catch(() => undefined)
  const query = getQuery(event).people
  const caller = { userId: event.context.session.user.id, keyId: null, keyName: 'Crews page' }
  setHeader(event, 'Cache-Control', 'no-store')
  return audited(caller, 'people', slug, async () => {
    const only = parsePeopleKeys(body, query)
    const crew = await crewBySlug(slug)
    const added = await addCrewPeople(crew, only)
    return {
      result: added.body,
      summary: added.added.length ? `added ${added.added.join(', ')} to` : 'added nobody to'
    }
  })
})
