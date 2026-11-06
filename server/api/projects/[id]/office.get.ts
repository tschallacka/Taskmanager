import { requireProject } from '../../../utils/projects'
import { officeSnapshotOf } from '../../../utils/officeSnapshot'
import type { OfficeSnapshot } from '../../../../shared/office/model'

// The office view of a board: every live top-level task with the stage its column stands for, and
// the people who carry the folders. Read-only, so the staff of a real board may watch its shadow board.
// A board without a crew answers 404, like a board the visitor cannot see.
export default defineEventHandler(async (event): Promise<OfficeSnapshot> => {
  const project = await requireProject(event, getRouterParam(event, 'id')!)
  return officeSnapshotOf(project)
})
