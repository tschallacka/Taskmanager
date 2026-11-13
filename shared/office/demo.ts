// A made-up crew board that plays every scene of SCENARIOS.md in order, then keeps the office busy
// with random but plausible moves. The office view runs it when no live board is wanted, so the
// scenes can be watched (and checked) without a crew at work.
import type { OfficePerson, OfficeSnapshot, OfficeTask, Stage } from './model'

export const DEMO_CAST: OfficePerson[] = [
  { userId: 'u-pia', key: 'pia', name: 'Pia Planner', role: 'pm' },
  { userId: 'u-wren', key: 'wren', name: 'Wren Worker', role: 'worker' },
  { userId: 'u-wick', key: 'wick', name: 'Wick Worker', role: 'worker' },
  { userId: 'u-wynn', key: 'wynn', name: 'Wynn Worker', role: 'worker' },
  { userId: 'u-wade', key: 'wade', name: 'Wade Worker', role: 'worker' },
  { userId: 'u-usher', key: 'usher', name: 'Usher Xander', role: 'ux' },
  { userId: 'u-nina', key: 'nina', name: 'Nina Nitpick', role: 'cq' },
  { userId: 'u-quincy', key: 'quincy', name: 'Quincy Average', role: 'qa' },
  { userId: 'u-boss', key: 'boss', name: 'Cato', role: 'boss' }
]

const COLUMN: Record<Stage, string> = {
  'backlog': 'Backlog',
  'todo': 'To do',
  'doing': 'In progress',
  'verify-pm': 'Verify PM',
  'verify-ux': 'Verify UX',
  'verify-cq': 'Verify CQ',
  'verify-qa': 'Verify QA',
  'verify-boss': 'Verify',
  'ready': 'Ready for live',
  'done': 'Done',
  'blocked': 'Blocked',
  'bugs': 'Bugs',
  'other': 'Ideas'
}

type Step
  = | ['add', string, string, Stage, string?]
    | ['move', string, Stage, string?]
    | ['comment', string]
    | ['tick', string]
    | ['delete', string]
    | ['wait']

/** The scenes, in the order SCENARIOS.md tells them. One step per beat. */
export const DEMO_SCRIPT: Step[] = [
  ['add', 'login', 'Login page', 'backlog'],
  ['add', 'dark', 'Dark mode', 'backlog'],
  ['move', 'login', 'todo', 'wren'],
  ['move', 'dark', 'todo', 'wick'],
  ['move', 'login', 'doing', 'wren'],
  ['move', 'dark', 'doing', 'wick'],
  ['add', 'search', 'Search box', 'backlog'],
  ['add', 'crash', 'Save button', 'backlog'],
  ['move', 'crash', 'todo', 'wade'],
  ['move', 'crash', 'doing', 'wade'],
  ['move', 'search', 'todo', 'wynn'],
  ['move', 'search', 'doing', 'wynn'],
  // Every gate hands the folder back to Pia, and only she sends it on: worker, Pia, usher, Pia, Nina, Pia,
  // Quincy, Pia, Boss. A reviewer's findings go to Pia as subtasks, so a rejection is hers to carry back.
  ['comment', 'login'],
  ['move', 'login', 'verify-pm', 'wren'],
  ['move', 'login', 'verify-ux', 'wren'],
  ['move', 'dark', 'blocked', 'wick'],
  ['move', 'login', 'verify-pm', 'wren'],
  ['move', 'login', 'verify-cq', 'wren'],
  ['move', 'login', 'verify-pm', 'wren'],
  ['move', 'login', 'todo', 'wren'],
  ['move', 'dark', 'todo', 'wick'],
  ['move', 'login', 'doing', 'wren'],
  ['move', 'search', 'verify-pm', 'wynn'],
  ['move', 'search', 'verify-ux', 'wynn'],
  ['add', 'old', 'That old idea', 'backlog'],
  ['move', 'search', 'verify-pm', 'wynn'],
  ['move', 'search', 'verify-cq', 'wynn'],
  ['delete', 'old'],
  ['move', 'search', 'verify-pm', 'wynn'],
  ['move', 'search', 'verify-qa', 'wynn'],
  ['move', 'dark', 'todo', 'wade'],
  ['move', 'search', 'verify-pm', 'wynn'],
  ['move', 'search', 'verify-boss', 'wynn'],
  ['move', 'dark', 'doing', 'wade'],
  ['move', 'crash', 'bugs', 'wade'],
  ['move', 'search', 'ready', 'wynn'],
  ['move', 'login', 'verify-pm', 'wren'],
  ['move', 'crash', 'todo', 'wren'],
  ['move', 'search', 'done', 'wynn'],
  ['tick', 'search'],
  ['move', 'login', 'verify-cq', 'wren'],
  ['move', 'login', 'verify-pm', 'wren'],
  ['move', 'login', 'verify-qa', 'wren'],
  ['move', 'login', 'verify-pm', 'wren'],
  ['move', 'login', 'verify-boss', 'wren'],
  // The Boss does not send work straight to a worker either: it goes back to Pia for triage.
  ['move', 'login', 'backlog'],
  ['wait']
]

const RANDOM_TITLES = [
  'Fix the flaky test', 'Rename the button', 'Faster board load', 'Export to CSV', 'Avatar upload',
  'Keyboard shortcuts', 'Empty state art', 'Undo for delete', 'Email digest', 'Mobile sidebar',
  'Rate limit the API', 'Help page typo', 'Timezone bug', 'Drag and drop fix', 'Print view'
]

const GATES: Stage[] = ['verify-ux', 'verify-cq', 'verify-qa']
const FLOW: Stage[] = ['backlog', 'todo', 'doing', 'verify-pm', 'verify-ux', 'verify-cq', 'verify-qa', 'verify-boss', 'ready', 'done']

export class DemoBoard {
  private tasks = new Map<string, OfficeTask>()
  /** How many review gates each folder has been through, so Pia knows which one to send it to next. */
  private passed = new Map<string, number>()
  private step = 0
  private serial = 0
  private random: () => number

  constructor(random: () => number = Math.random) {
    this.random = random
  }

  snapshot(): OfficeSnapshot {
    const tasks = [...this.tasks.values()].map(t => ({ ...t }))
    // Each person's status follows the board, as the crew monitor reads it: busy while they have an open card in a
    // working column (In progress, or a Verify column), idle otherwise. So the desk lamps show the rule in the demo.
    const cast = DEMO_CAST.map((p) => {
      const working = tasks.find(t => t.assigneeId === p.userId && !t.completed && (t.stage === 'doing' || t.stage.startsWith('verify-')))
      return working
        ? { ...p, status: { state: 'busy' as const, note: `Busy: ${working.title} in ${working.column}` } }
        : { ...p, status: { state: 'idle' as const, note: '' } }
    })
    return { boardId: 'demo', boardName: 'Demo office', crewName: 'The demo crew', cast, tasks }
  }

  /** True while the scripted scenes still have beats left. */
  get scripted(): boolean {
    return this.step < DEMO_SCRIPT.length
  }

  /** Plays one beat: the next scripted step, then random moves once the script is over. */
  advance(): OfficeSnapshot {
    if (this.scripted) this.apply(DEMO_SCRIPT[this.step++]!)
    else this.chaos()
    return this.snapshot()
  }

  private userOf(key?: string): string | null {
    return key ? DEMO_CAST.find(p => p.key === key)?.userId ?? null : null
  }

  private apply(step: Step) {
    switch (step[0]) {
      case 'add': {
        const [, id, title, stage, who] = step
        this.tasks.set(id, { id, title, stage, column: COLUMN[stage], assigneeId: this.userOf(who), completed: false, blocked: false, comments: 0 })
        break
      }
      case 'move': {
        const [, id, stage, who] = step
        const task = this.tasks.get(id)
        if (task) Object.assign(task, { stage, column: COLUMN[stage], assigneeId: this.userOf(who) })
        break
      }
      case 'comment': {
        const task = this.tasks.get(step[1])
        if (task) task.comments++
        break
      }
      case 'tick': {
        const task = this.tasks.get(step[1])
        if (task) task.completed = true
        break
      }
      case 'delete':
        this.tasks.delete(step[1])
        break
      default:
        break
    }
  }

  private pick<T>(items: T[]): T {
    return items[Math.floor(this.random() * items.length)]!
  }

  private chaos() {
    const live = [...this.tasks.values()].filter(t => t.stage !== 'done')
    const workers = DEMO_CAST.filter(p => p.role === 'worker')
    if (live.length < 6 || this.random() < 0.15) {
      const id = `r${++this.serial}`
      this.apply(['add', id, this.pick(RANDOM_TITLES), this.random() < 0.15 ? 'bugs' : 'backlog'])
      return
    }
    // Old finished folders leave the archive now and then, so it does not fill forever.
    const done = [...this.tasks.values()].filter(t => t.stage === 'done')
    if (done.length > 4) {
      this.tasks.delete(done[0]!.id)
      return
    }
    const task = this.pick(live)
    const roll = this.random()
    if (roll < 0.08) {
      this.apply(['comment', task.id])
      return
    }
    if (task.stage === 'bugs' || task.stage === 'blocked' || task.stage === 'other') {
      this.apply(['move', task.id, 'todo', this.pick(workers).key])
      return
    }
    const worker = DEMO_CAST.find(p => p.userId === task.assigneeId)?.key ?? this.pick(workers).key
    if (task.stage === 'doing' && roll < 0.14) {
      this.apply(['move', task.id, 'blocked', worker])
      return
    }
    // A reviewer never hands a folder on or back to a worker: it goes back to Pia, who decides what is next.
    const gate = GATES.indexOf(task.stage)
    if (gate >= 0) {
      this.passed.set(task.id, gate + 1)
      this.apply(['move', task.id, 'verify-pm', worker])
      return
    }
    if (task.stage === 'verify-pm') {
      const next = this.passed.get(task.id) ?? 0
      if (roll < 0.25) {
        // Pia sees at a glance that it is not right and sends it back to the worker.
        this.passed.delete(task.id)
        this.apply(['move', task.id, 'todo', worker])
      } else if (next < GATES.length) {
        // The usability gate is skipped when nothing a person sees has changed.
        const skip = next === 0 && this.random() < 0.4
        this.apply(['move', task.id, GATES[skip ? 1 : next]!, worker])
      } else {
        this.passed.delete(task.id)
        this.apply(['move', task.id, 'verify-boss', worker])
      }
      return
    }
    if (task.stage === 'verify-boss' && roll < 0.2) {
      // The Boss sends it back to Pia for triage, not to a worker.
      this.apply(['move', task.id, 'backlog'])
      return
    }
    const at = FLOW.indexOf(task.stage)
    this.apply(['move', task.id, FLOW[Math.min(at + 1, FLOW.length - 1)]!, worker])
  }
}
