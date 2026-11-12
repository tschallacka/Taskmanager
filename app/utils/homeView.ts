// The home page's lists, counted from what the app already has: My tasks in three groups, the Getting started steps, and
// the project rows with their progress. Pure, so the page's rules are tested without a browser (redesign 6/9).
import { isOverdueDay } from './dueDate'

export interface GroupTask {
  id: string
  dueOn?: string | null
}

export interface TaskGroup<T extends GroupTask> {
  key: 'overdue' | 'today' | 'later'
  label: string
  tasks: T[]
}

/** My tasks in three groups by due date: Overdue, Today, then Later (an undated task is Later). Empty groups are left out. */
export function taskGroups<T extends GroupTask>(tasks: readonly T[], today: string, now: Date): TaskGroup<T>[] {
  const overdue: T[] = []
  const dueToday: T[] = []
  const later: T[] = []
  for (const task of tasks) {
    if (task.dueOn && isOverdueDay(task.dueOn, now)) overdue.push(task)
    else if (task.dueOn === today) dueToday.push(task)
    else later.push(task)
  }
  return [
    { key: 'overdue' as const, label: 'Overdue', tasks: overdue },
    { key: 'today' as const, label: 'Today', tasks: dueToday },
    { key: 'later' as const, label: 'Later', tasks: later }
  ].filter(group => group.tasks.length > 0)
}

/** What the person has done so far, for the Getting started steps. Two steps are the person's own choice (see the page). */
export interface StepFacts {
  hasProject: boolean
  hasTask: boolean
  hasFinishedTask: boolean
  inviteDone: boolean
  agentDone: boolean
}

export interface GettingStartedStep {
  key: 'project' | 'task' | 'finish' | 'invite' | 'agent'
  label: string
  done: boolean
}

/** The five steps for a new person, in order, each with whether it is done. */
export function gettingStartedSteps(facts: StepFacts): GettingStartedStep[] {
  return [
    { key: 'project', label: 'Create a project', done: facts.hasProject },
    { key: 'task', label: 'Add a task', done: facts.hasTask },
    { key: 'finish', label: 'Finish one', done: facts.hasFinishedTask },
    { key: 'invite', label: 'Invite someone', done: facts.inviteDone },
    { key: 'agent', label: 'Let an agent help', done: facts.agentDone }
  ]
}

/** The name of the project a task belongs to, for the chip on a My tasks row. Null when the project is not in the list. */
export function projectNameOf(projectId: string, projects: readonly { id: string, name: string }[]): string | null {
  return projects.find(project => project.id === projectId)?.name ?? null
}

export interface ProgressTask {
  projectId: string
  completedAt?: number | null
  updatedAt?: number | null
}

export interface ProgressProject {
  id: string
  status?: string | null
}

export interface ProjectRow<P extends ProgressProject> {
  project: P
  total: number
  done: number
  /** The latest update time of the project's tasks, 0 when it has none. */
  latest: number
  /** Whole percent of done tasks, 0 with no tasks. */
  percent: number
}

/** The first `limit` projects, each with its tasks' count, done count, latest change and percent done. */
export function projectRows<P extends ProgressProject>(projects: readonly P[], tasks: readonly ProgressTask[], limit = 6): ProjectRow<P>[] {
  return projects.slice(0, limit).map((project) => {
    const own = tasks.filter(task => task.projectId === project.id)
    const done = own.filter(task => task.completedAt != null).length
    const latest = own.reduce((max, task) => Math.max(max, task.updatedAt ?? 0), 0)
    return {
      project,
      total: own.length,
      done,
      latest,
      percent: own.length ? Math.round((done / own.length) * 100) : 0
    }
  })
}
