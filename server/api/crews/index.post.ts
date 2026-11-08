import { createError } from 'h3'
import { answerWithoutSecrets, audited, createOrRotateCrew, parseCrewInput, requireCrewManager } from '../../utils/crewProvisioning'
import { makeBoundCrew, makeCrewOnNewBoard, parseNewBoard } from '../../utils/crewBoards'
import { requireCreateOnOwnBoard } from '../../utils/managementToken'
import { isInstanceAdmin } from '../../utils/crewPermission'
import { chargeRateLimit, limitsFor, scopeOfBoard } from '../../utils/rateLimits'

/**
 * Makes a crew: its team, accounts, customer, board and one key per account. A slug
 * already taken answers 409 unless `rotate` is true, which gives every account new keys and a new password.
 * The answer never carries a key or a password, for any caller: they come from POST /api/crews/:slug/keys, once.
 * With `projectId` (and optionally `teamId`, the real board's team) the crew is also bound to
 * that board: its shadow board is made and linked, and the answer adds the userboard and the
 * real and shadow boards. With `newBoard` ({ name }, and `teamId`) the board is made first, in that team, and
 * the crew is bound to it the same way; `rotate` never makes a board. Without either the request and the answer are the same as before.
 */
export default defineEventHandler(async (event) => {
  const caller = await requireCrewManager(event)
  const body = await readBody<Record<string, unknown>>(event).catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError({ statusCode: 400, message: 'Send a JSON object.' })
  }
  const input = parseCrewInput(body)
  if (body.teamId !== undefined && body.projectId === undefined && body.newBoard === undefined) {
    throw createError({ statusCode: 400, message: 'teamId needs a projectId.' })
  }
  const newBoard = parseNewBoard(body, caller)

  const outcome = await audited(caller, 'create', input.slug, async () => {
    if (!newBoard) await requireCreateOnOwnBoard(caller, input.slug, body.projectId)
    // Crews made or rotated by one person are counted against the crew limits (rateLimits.ts).
    const boardId = caller.boardId ?? (typeof body.projectId === 'string' ? body.projectId : null)
    // The instance admin's crew calls are not counted: the existing crew API gets no new refusals.
    if (!(await isInstanceAdmin(caller.userId))) {
      await chargeRateLimit('crews', `user:${caller.userId}`, await limitsFor('crews', await scopeOfBoard(boardId)), event)
    }
    if (newBoard) {
      const { made, boardId: madeBoardId } = await makeCrewOnNewBoard(input, caller, newBoard)
      return { result: answerWithoutSecrets(made, input.slug), summary: 'created (new board)', projectId: madeBoardId }
    }
    const made = body.projectId === undefined
      ? await createOrRotateCrew(input, caller)
      : await makeBoundCrew(input, caller, { projectId: body.projectId, teamId: body.teamId })
    const summary = made.status === 201 ? 'created' : 'rotated keys of'
    // No secret in this answer, for any caller: the keys route gives the keys and passwords, once.
    return { result: answerWithoutSecrets(made, input.slug), summary }
  })
  setResponseStatus(event, outcome.status)
  return outcome.body
})
