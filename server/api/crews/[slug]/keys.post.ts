import { createError } from 'h3'
import { audited, crewBySlug, crewKeysEnv, requireCrewManager, rotateCrew } from '../../../utils/crewProvisioning'
import { requireCrewOnOwnBoard } from '../../../utils/managementToken'
import { isInstanceAdmin } from '../../../utils/crewPermission'
import { chargeRateLimit, limitsFor, scopeOfBoard } from '../../../utils/rateLimits'

/**
 * New keys and passwords for every account of a crew, the same as a rotate: the previous ones stop working at once.
 * The answer is text/plain environment lines (one export per person and secret, a comment first), so an agent
 * saves it to a file with one curl and never reads the secrets. ?format=json gives the JSON shape the create
 * answer has (the Blaze Console reads that). Nothing of the secrets is logged or written to the audit.
 */
export default defineEventHandler(async (event) => {
  const caller = await requireCrewManager(event)
  const slug = String(getRouterParam(event, 'slug') ?? '')
  const format = getQuery(event).format
  if (format !== undefined && format !== 'env' && format !== 'json') {
    throw createError({ statusCode: 400, message: 'format is env or json.' })
  }
  const answer = await audited(caller, 'keys', slug, async () => {
    const crew = await crewBySlug(slug)
    await requireCrewOnOwnBoard(caller, crew)
    // Counted against the crews limit like a rotate; the instance admin's calls are not counted.
    if (!(await isInstanceAdmin(caller.userId))) {
      await chargeRateLimit('crews', `user:${caller.userId}`, await limitsFor('crews', await scopeOfBoard(caller.boardId ?? null)), event)
    }
    return { result: await rotateCrew(crew), summary: 'made new keys for' }
  })
  setHeader(event, 'Cache-Control', 'no-store')
  if (format === 'json') return answer
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  return crewKeysEnv(answer)
})
