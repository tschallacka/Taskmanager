import { createError, getQuery } from 'h3'
import { chargeRateLimit, limitsFor } from '../../utils/rateLimits'
import { publishFromEvent } from '../../utils/realtime'
import { genId } from '../../utils/projects'
import { claimImportSlot, emptyTargetFor, releaseImportSlot, writeImportPlan } from '../../utils/boardImport'
import { planBoardImport } from '../../utils/boardImportPlan'
import { callerForNewBoard, readBackupBody, readImportOptions } from '../../utils/boardImportRequest'

// POST /api/projects/import?teamId=<team>&name=<name>: creates a board from a board backup (format
// "taskmanager-board-backup", version 1). Same admin rule as importing into a board: the instance admin, or
// an owner or admin of the team. Without teamId the board is personal and belongs to the caller.
// `?dryRun=1` returns the report and creates nothing. The board keeps the backup's dates and authors.
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const teamId = typeof query.teamId === 'string' && query.teamId ? query.teamId : null
  const caller = await callerForNewBoard(event, teamId)
  const options = readImportOptions(event, caller)
  const backup = await readBackupBody(event)
  const projectId = genId()

  if (!claimImportSlot(projectId)) {
    throw createError({ statusCode: 409, message: 'An import is already running. Try again when it has finished.' })
  }
  try {
    const outcome = planBoardImport(backup, options, emptyTargetFor(projectId, {
      userId: caller.userId,
      name: caller.name,
      isOwner: true
    }))
    if (!outcome.ok) {
      throw createError({ statusCode: outcome.status, message: outcome.message, data: { problems: outcome.problems } })
    }
    if (options.dryRun) return { projectId, report: outcome.plan.report }

    if (!caller.isInstanceAdmin) {
      await chargeRateLimit('imports', `user:${caller.userId}`, await limitsFor('imports'), event)
    }
    const name = typeof query.name === 'string' ? query.name : null
    await writeImportPlan(outcome.plan, {
      importerId: caller.userId,
      keyId: caller.keyId,
      keyName: caller.keyName,
      createBoard: { teamId, name }
    })
    await publishFromEvent(event, { type: 'projects', projectId })
    return { projectId, report: outcome.plan.report }
  } finally {
    releaseImportSlot(projectId)
  }
})
