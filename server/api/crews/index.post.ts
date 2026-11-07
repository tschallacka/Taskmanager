import { createError } from 'h3'
import { audited, createOrRotateCrew, parseCrewInput, requireCrewManager } from '../../utils/crewProvisioning'
import { makeBoundCrew } from '../../utils/crewBoards'

/**
 * Makes a crew: its team, accounts, customer, board and one key per account. A slug
 * already taken answers 409 (with no secrets) unless `rotate` is true, which gives every
 * account new keys and a new password and answers with them once.
 * With `projectId` (and optionally `teamId`, the real board's team) the crew is also bound to
 * that board: its shadow board is made and linked, and the answer adds the userboard and the
 * real and shadow boards. Without `projectId` the request and the answer are the same as before.
 */
export default defineEventHandler(async (event) => {
  const caller = await requireCrewManager(event)
  const body = await readBody<Record<string, unknown>>(event).catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError({ statusCode: 400, message: 'Send a JSON object.' })
  }
  const input = parseCrewInput(body)
  if (body.teamId !== undefined && body.projectId === undefined) {
    throw createError({ statusCode: 400, message: 'teamId needs a projectId.' })
  }

  const outcome = await audited(caller, 'create', input.slug, async () => {
    const made = body.projectId === undefined
      ? await createOrRotateCrew(input, caller)
      : await makeBoundCrew(input, caller, { projectId: body.projectId, teamId: body.teamId })
    const summary = made.status === 201 ? 'created' : 'rotated keys of'
    return { result: made, summary }
  })
  setResponseStatus(event, outcome.status)
  return outcome.body
})
