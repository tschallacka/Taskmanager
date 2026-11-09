import { createError } from 'h3'
import { chargeRateLimit, limitsFor, scopeOfBoard } from '../../../utils/rateLimits'
import { publishFromEvent } from '../../../utils/realtime'
import { claimImportSlot, loadImportTarget, releaseImportSlot, writeImportPlan } from '../../../utils/boardImport'
import { planBoardImport } from '../../../utils/boardImportPlan'
import { callerForBoard, readBackupBody, readImportOptions } from '../../../utils/boardImportRequest'

// POST /api/projects/:id/import: loads a board backup (format "taskmanager-board-backup", version 1, see
// shared/backup/schema.ts) into this board. `?dryRun=1` checks the file and returns the report, and writes
// nothing. Otherwise the whole import is one transaction. Only the instance admin, or an owner or admin of the
// board's team, may import: see importRefusal in server/utils/boardImport.ts.
// Query: dryRun, columnMap (JSON), authorMap (JSON), onMissingColumn=create|fail, idempotencyKey, force=1 (instance admin).
export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')!
  const { caller, project } = await callerForBoard(event, projectId)
  const options = readImportOptions(event, caller)
  const backup = await readBackupBody(event)

  if (!claimImportSlot(projectId)) {
    throw createError({ statusCode: 409, message: 'An import into this board is already running. Try again when it has finished.' })
  }
  try {
    const target = await loadImportTarget(projectId, {
      userId: caller.userId,
      name: caller.name,
      isOwner: project.userId === caller.userId
    })
    const outcome = planBoardImport(backup, options, target)
    if (!outcome.ok) {
      throw createError({ statusCode: outcome.status, message: outcome.message, data: { problems: outcome.problems } })
    }
    if (options.dryRun) return outcome.plan.report

    if (!caller.isInstanceAdmin) {
      await chargeRateLimit('imports', `user:${caller.userId}`, await limitsFor('imports', await scopeOfBoard(projectId)), event)
    }
    await writeImportPlan(outcome.plan, {
      importerId: caller.userId,
      keyId: caller.keyId,
      keyName: caller.keyName,
      createBoard: null
    })
    await publishFromEvent(event, { type: 'board', projectId })
    return outcome.plan.report
  } finally {
    releaseImportSlot(projectId)
  }
})
