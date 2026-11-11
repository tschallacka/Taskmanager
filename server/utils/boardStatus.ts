// The crew monitor's board rule: busy or idle for each crew member, read from the board alone. Pure, so the rule is
// tested without a database. The agent reports that add "stuck?" come with the rest of the monitor.
import type { PersonStatus, Stage } from '../../shared/office/model'

/** One live task of a board, as the rule needs it. `stage` is the column's stage; `column` is its name. */
export interface MonitorTask {
  id: string
  title: string
  stage: Stage
  column: string
  assigneeId: string | null
  parentTaskId: string | null
  completed: boolean
}

/** A column a person is working in: In progress, or a Verify column they are waiting on. */
export function isWorkingStage(stage: Stage): boolean {
  return stage === 'doing' || stage.startsWith('verify-')
}

/**
 * busy when the person has a card in a working column, or an open subtask of theirs under a card in a working column
 * (the parent may be someone else's). A done subtask does not count, and nothing else does: otherwise idle.
 */
export function boardStatusOf(userId: string, tasks: MonitorTask[]): PersonStatus {
  const byId = new Map(tasks.map(t => [t.id, t]))
  for (const task of tasks) {
    if (task.assigneeId !== userId || task.completed || task.parentTaskId) continue
    if (isWorkingStage(task.stage)) return { state: 'busy', note: `Busy: ${task.title} in ${task.column}` }
  }
  for (const task of tasks) {
    if (task.assigneeId !== userId || task.completed || !task.parentTaskId) continue
    const parent = byId.get(task.parentTaskId)
    if (parent && !parent.completed && isWorkingStage(parent.stage)) {
      return { state: 'busy', note: `Busy: subtask ${task.title} under ${parent.title}` }
    }
  }
  return { state: 'idle', note: '' }
}
