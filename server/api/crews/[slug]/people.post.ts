import { addCrewPeople, audited, crewBySlug, parsePeopleKeys, requireCrewManager } from '../../../utils/crewProvisioning'
import { requireCrewOnOwnBoard } from '../../../utils/managementToken'
import { isInstanceAdmin } from '../../../utils/crewPermission'
import { chargeRateLimit, limitsFor, scopeOfBoard } from '../../../utils/rateLimits'

/**
 * Adds the people of the crew kit that the crew lacks, the way crew create makes them: an account, the team seat (or the
 * customer login for a contact) and a key each. Named with a body {"people": ["susy", "janet"]} or ?people=susy,janet;
 * nobody named means everyone the kit has. Accounts, keys and sessions that exist are not touched, so nothing rotates.
 * The answer carries the keys of the new people only, in the keys route's JSON shape. One audit row per call.
 */
export default defineEventHandler(async (event) => {
  const caller = await requireCrewManager(event)
  const slug = String(getRouterParam(event, 'slug') ?? '')
  const body = await readBody(event).catch(() => undefined)
  const query = getQuery(event).people
  const answer = await audited(caller, 'people', slug, async () => {
    const only = parsePeopleKeys(body, query)
    const crew = await crewBySlug(slug)
    await requireCrewOnOwnBoard(caller, crew)
    // Counted against the crews limit like a rotate; the instance admin's calls are not counted.
    if (!(await isInstanceAdmin(caller.userId))) {
      await chargeRateLimit('crews', `user:${caller.userId}`, await limitsFor('crews', await scopeOfBoard(caller.boardId ?? null)), event)
    }
    const added = await addCrewPeople(crew, only)
    return {
      result: added.body,
      summary: added.added.length ? `added ${added.added.join(', ')} to` : 'added nobody to'
    }
  })
  setHeader(event, 'Cache-Control', 'no-store')
  return answer
})
