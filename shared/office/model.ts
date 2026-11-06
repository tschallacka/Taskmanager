// The office view's model: where every task folder lies in the office, and which errand moves it
// when the board changes. Pure, so the choreography can be tested without a renderer. The scenes
// themselves are written out in SCENARIOS.md next to this file.

/** Where a task stands, from its column's name. Unknown columns read as `other`. */
export type Stage
  = | 'backlog' | 'todo' | 'doing'
    | 'verify-pm' | 'verify-ux' | 'verify-cq' | 'verify-qa' | 'verify-boss'
    | 'ready' | 'done' | 'blocked' | 'bugs' | 'other'

export type Role = 'pm' | 'worker' | 'ux' | 'cq' | 'qa' | 'boss'

export interface OfficePerson {
  /** The account id; tasks name their assignee by it. Empty for a stand-in. */
  userId: string
  /** pia, wren, usher ... or `u-<id>` for someone outside the crew. */
  key: string
  name: string
  role: Role
}

export interface OfficeTask {
  id: string
  title: string
  stage: Stage
  column: string
  assigneeId: string | null
  completed: boolean
  blocked: boolean
  comments: number
}

export interface OfficeSnapshot {
  boardId: string
  boardName: string
  crewName: string | null
  cast: OfficePerson[]
  tasks: OfficeTask[]
}

const STAGE_BY_NAME: Record<string, Stage> = {
  'backlog': 'backlog',
  'to do': 'todo',
  'todo': 'todo',
  'in progress': 'doing',
  'doing': 'doing',
  'verify pm': 'verify-pm',
  'verify ux': 'verify-ux',
  'verify cq': 'verify-cq',
  'verify qa': 'verify-qa',
  'verify': 'verify-boss',
  'review': 'verify-boss',
  'ready for live': 'ready',
  'ready': 'ready',
  'done': 'done',
  'blocked': 'blocked',
  'bugs': 'bugs'
}

export function stageOf(columnName: string): Stage {
  return STAGE_BY_NAME[columnName.trim().toLowerCase()] ?? 'other'
}

const ROLE_BY_KEY: Record<string, Role> = {
  pia: 'pm',
  pm: 'pm',
  usher: 'ux',
  nina: 'cq',
  nitpicker: 'cq',
  quincy: 'qa',
  boss: 'boss',
  cato: 'boss'
}

export function roleOfKey(key: string): Role {
  return ROLE_BY_KEY[key] ?? 'worker'
}

/**
 * Every spot a folder can lie. A person's spots are `<key>:<slot>`; the rest are fixtures of
 * the office. `tube` is where new folders come from, `shredder` where deleted ones go.
 */
export type Place = string

export const TUBE = 'tube'
export const SHREDDER = 'shredder'
export const SHELF = 'shelf:blocked'
export const JAR = 'jar:bugs'
export const DOCK = 'dock:ready'
export const ARCHIVE = 'archive:done'

const FIXTURES = new Set(['shelf', 'jar', 'dock', 'archive'])

export function ownerOf(place: Place): string | null {
  const [owner, slot] = place.split(':')
  if (!slot || FIXTURES.has(owner!)) return null
  return owner!
}

export function slotOf(place: Place): string {
  return place.split(':')[1] ?? place
}

/** The office's people as the scene needs them: always a Pia and a Boss, even on a board without one. */
export function castWithStandIns(cast: OfficePerson[]): OfficePerson[] {
  const out = [...cast]
  if (!out.some(p => p.role === 'pm')) out.unshift({ userId: '', key: 'pia', name: 'Pia Planner', role: 'pm' })
  if (!out.some(p => p.role === 'boss')) out.push({ userId: '', key: 'boss', name: 'Cato', role: 'boss' })
  return out
}

function pmKey(cast: OfficePerson[]): string {
  return cast.find(p => p.role === 'pm')?.key ?? 'pia'
}

function keyOfRole(cast: OfficePerson[], role: Role): string | null {
  return cast.find(p => p.role === role)?.key ?? null
}

/** Where a task's folder lies, from its stage and assignee. */
export function placeOf(task: OfficeTask, cast: OfficePerson[]): Place {
  const pia = pmKey(cast)
  const assignee = task.assigneeId ? cast.find(p => p.userId === task.assigneeId) : undefined
  const atWorker = (slot: string) => (assignee && assignee.role === 'worker' ? `${assignee.key}:${slot}` : `${pia}:backlog`)
  const review = (role: Role) => {
    const key = keyOfRole(cast, role)
    return key ? `${key}:review` : `${pia}:verify`
  }
  switch (task.stage) {
    case 'backlog': return `${pia}:backlog`
    case 'todo': return atWorker('todo')
    case 'doing': return atWorker('desk')
    case 'verify-pm': return `${pia}:verify`
    case 'verify-ux': return review('ux')
    case 'verify-cq': return review('cq')
    case 'verify-qa': return review('qa')
    case 'verify-boss': return `${keyOfRole(cast, 'boss') ?? 'boss'}:inbox`
    case 'ready': return DOCK
    case 'done': return ARCHIVE
    case 'blocked': return SHELF
    case 'bugs': return JAR
    default: return `${pia}:backlog`
  }
}

export type ErrandKind
  = | 'arrive' | 'assign' | 'start' | 'pause' | 'hand-in' | 'pass-on' | 'reject'
    | 'reassign' | 'block' | 'unblock' | 'bug' | 'ship' | 'done' | 'reopen' | 'delete' | 'shuffle'

/** One trip: `courier` walks to `from`, picks the folder up, carries it to `to` and drops it. */
export interface Errand {
  taskId: string
  title: string
  kind: ErrandKind
  /** Who walks. A new task (`from` is the tube: outside the office) is unpacked and carried by the Boss. */
  courier: string | null
  from: Place
  to: Place
}

const REVIEW_SLOTS = new Set(['verify', 'review', 'inbox'])

function isWorkerPlace(place: Place, cast: OfficePerson[]): boolean {
  const owner = ownerOf(place)
  return Boolean(owner && cast.find(p => p.key === owner)?.role === 'worker')
}

function isReviewPlace(place: Place): boolean {
  return ownerOf(place) !== null && REVIEW_SLOTS.has(slotOf(place))
}

export function kindOf(from: Place, to: Place, cast: OfficePerson[]): ErrandKind {
  if (to === SHREDDER) return 'delete'
  if (from === TUBE) return 'arrive'
  if (to === SHELF) return 'block'
  if (to === JAR) return 'bug'
  if (to === DOCK) return 'ship'
  if (to === ARCHIVE) return 'done'
  if (from === SHELF) return 'unblock'
  if (from === DOCK || from === ARCHIVE || from === JAR) return 'reopen'
  if (isWorkerPlace(from, cast) && isWorkerPlace(to, cast)) {
    if (ownerOf(from) !== ownerOf(to)) return 'reassign'
    return slotOf(to) === 'desk' ? 'start' : 'pause'
  }
  if (slotOf(from) === 'backlog' && isWorkerPlace(to, cast)) return 'assign'
  if (isWorkerPlace(from, cast) && isReviewPlace(to)) return 'hand-in'
  if (isReviewPlace(from) && (isWorkerPlace(to, cast) || slotOf(to) === 'backlog')) return 'reject'
  if (isReviewPlace(from) && isReviewPlace(to)) return 'pass-on'
  return 'shuffle'
}

/**
 * Who makes the trip. A new task comes from the real board as a parcel the courier hands to the Boss,
 * so the Boss takes it where it goes. Pia hands out and fetches; a person carries out what lies on
 * their own desk; a folder moving between two workers is fetched by Pia, since she decides who does what.
 */
export function courierOf(from: Place, to: Place, kind: ErrandKind, cast: OfficePerson[]): string | null {
  const pia = pmKey(cast)
  if (kind === 'arrive') return keyOfRole(cast, 'boss') ?? 'boss'
  if (kind === 'reassign') return pia
  return ownerOf(from) ?? pia
}

const FIXTURE_NAMES: Record<string, string> = {
  [SHELF]: 'the blocked shelf',
  [JAR]: 'the bug jar',
  [DOCK]: 'the launch pad',
  [ARCHIVE]: 'the archive'
}

/** The errands that turn the office of `prev` into the office of `next`. */
export function errandsBetween(prev: OfficeSnapshot | null, next: OfficeSnapshot): Errand[] {
  if (!prev) return []
  const cast = castWithStandIns(next.cast)
  const prevCast = castWithStandIns(prev.cast)
  const before = new Map(prev.tasks.map(t => [t.id, t]))
  const errands: Errand[] = []
  const add = (task: OfficeTask, from: Place, to: Place) => {
    if (from === to) return
    const kind = kindOf(from, to, cast)
    errands.push({ taskId: task.id, title: task.title, kind, courier: courierOf(from, to, kind, cast), from, to })
  }
  for (const task of next.tasks) {
    const old = before.get(task.id)
    add(task, old ? placeOf(old, prevCast) : TUBE, placeOf(task, cast))
  }
  const now = new Set(next.tasks.map(t => t.id))
  for (const old of prev.tasks) {
    if (!now.has(old.id)) add(old, placeOf(old, prevCast), SHREDDER)
  }
  return errands
}

/** Smaller happenings that are not trips: a new update on a task, a task ticked off. */
export interface Ping {
  taskId: string
  kind: 'comment' | 'completed'
  place: Place
}

export function pingsBetween(prev: OfficeSnapshot | null, next: OfficeSnapshot): Ping[] {
  if (!prev) return []
  const cast = castWithStandIns(next.cast)
  const before = new Map(prev.tasks.map(t => [t.id, t]))
  const pings: Ping[] = []
  for (const task of next.tasks) {
    const old = before.get(task.id)
    if (!old) continue
    if (task.comments > old.comments) pings.push({ taskId: task.id, kind: 'comment', place: placeOf(task, cast) })
    if (task.completed && !old.completed) pings.push({ taskId: task.id, kind: 'completed', place: placeOf(task, cast) })
  }
  return pings
}

export type Activity = 'idle' | 'working' | 'eyeing-todo' | 'reviewing' | 'triaging' | 'sorting'

/**
 * What a person does while nobody is carrying anything, from where the folders lie now. A worker
 * with a folder on the desk works; one with only a full todo tray eyes it; one with neither is idle,
 * which the office plays as dozing, a phone, a game or ping-pong.
 */
export function activityOf(person: OfficePerson, places: Iterable<Place>): Activity {
  const mine = [...places].filter(place => ownerOf(place) === person.key)
  const has = (slot: string) => mine.some(place => slotOf(place) === slot)
  switch (person.role) {
    case 'worker':
      if (has('desk')) return 'working'
      if (has('todo')) return 'eyeing-todo'
      return 'idle'
    case 'pm':
      if (has('verify')) return 'triaging'
      if (has('backlog')) return 'sorting'
      return 'idle'
    default:
      return has('review') || has('inbox') ? 'reviewing' : 'idle'
  }
}

/** A line for the ticker: what the office just saw happen. */
export function describeErrand(errand: Errand, cast: OfficePerson[]): string {
  const name = (key: string | null) => {
    if (!key) return 'Someone'
    return cast.find(p => p.key === key)?.name.split(/\s+/)[0] ?? key
  }
  const who = name(errand.courier)
  const toOwner = name(ownerOf(errand.to))
  const t = `“${errand.title}”`
  switch (errand.kind) {
    case 'arrive': {
      const owner = ownerOf(errand.to)
      const where = owner ? name(owner) : FIXTURE_NAMES[errand.to] ?? 'its spot'
      return `A courier brings ${t}; ${who} unpacks it for ${where}`
    }
    case 'assign': return `${who} hands ${t} to ${toOwner}`
    case 'start': return `${who} cracks open ${t}`
    case 'pause': return `${who} puts ${t} back in the tray`
    case 'hand-in': return `${who} hands in ${t} for review`
    case 'pass-on': return `${who} passes ${t} on to ${toOwner}`
    case 'reject': return `${who} sends ${t} back to ${toOwner}`
    case 'reassign': return `${who} moves ${t} from ${name(ownerOf(errand.from))} to ${toOwner}`
    case 'block': return `${who} parks ${t} on the blocked shelf`
    case 'unblock': return `${who} rescues ${t} from the blocked shelf`
    case 'bug': return `${who} drops ${t} into the bug jar`
    case 'ship': return `${who} straps ${t} to a rocket`
    case 'done': return `${who} files ${t} in the archive`
    case 'reopen': return `${who} digs ${t} back out`
    case 'delete': return `${who} feeds ${t} to the shredder`
    default: return `${who} shuffles ${t} around`
  }
}

/**
 * Where the office of a board lives. The one place that knows the path, so a button, a menu entry or a
 * notification anywhere can link to it. `demo` is the made-up board. The page follows the board it is
 * given, and refuses a board its visitor cannot see, so a link never shows more than the board does.
 */
export function officePath(boardId: string): string {
  return `/office/${encodeURIComponent(boardId)}`
}

export type DeskState = 'working' | 'queued' | 'reviewing' | 'idle'

export interface DeskCard {
  id: string
  title: string
}

export interface DeskStatus {
  key: string
  name: string
  role: Role
  state: DeskState
  /** Cards on the person's desk (working), in their todo tray (queued), or in their gate (reviewing). */
  cards: DeskCard[]
  /** The gates a worker's own cards wait in, as UX, CQ, QA, PM or Boss. Why an idle worker is idle. */
  waitingOn: string[]
}

const GATE_BY_STAGE: Partial<Record<Stage, string>> = {
  'verify-pm': 'PM',
  'verify-ux': 'UX',
  'verify-cq': 'CQ',
  'verify-qa': 'QA',
  'verify-boss': 'Boss'
}

/**
 * What each person of the cast is doing, from the same placement the office draws. The office scene
 * and crew_activity both read this, so they cannot disagree about who is idle. A worker's own card in a
 * review gate is not on their desk: the reviewer holds it, so the worker reads idle, with the gate named.
 */
export function deskStatesOf(snapshot: OfficeSnapshot): DeskStatus[] {
  const cast = castWithStandIns(snapshot.cast)
  const placed = snapshot.tasks.map(task => ({ task, place: placeOf(task, cast) }))
  return cast.map((person) => {
    const mine = placed.filter(({ place }) => ownerOf(place) === person.key)
    const cardsIn = (slot: string) => mine
      .filter(({ place }) => slotOf(place) === slot)
      .map(({ task }) => ({ id: task.id, title: task.title }))
    const gates = person.userId
      ? snapshot.tasks
          .filter(task => task.assigneeId === person.userId && GATE_BY_STAGE[task.stage])
          .map(task => GATE_BY_STAGE[task.stage]!)
      : []
    const waitingOn = [...new Set(gates)]
    if (person.role === 'worker') {
      const desk = cardsIn('desk')
      if (desk.length) return { key: person.key, name: person.name, role: person.role, state: 'working', cards: desk, waitingOn }
      const todo = cardsIn('todo')
      if (todo.length) return { key: person.key, name: person.name, role: person.role, state: 'queued', cards: todo, waitingOn }
      return { key: person.key, name: person.name, role: person.role, state: 'idle', cards: [], waitingOn }
    }
    if (person.role === 'pm') {
      // Pia's own Verify column is the review she does; a card waiting in Backlog is work queued for her.
      const verify = cardsIn('verify')
      if (verify.length) return { key: person.key, name: person.name, role: person.role, state: 'reviewing', cards: verify, waitingOn: [] }
      const backlog = cardsIn('backlog')
      if (backlog.length) return { key: person.key, name: person.name, role: person.role, state: 'queued', cards: backlog, waitingOn: [] }
      return { key: person.key, name: person.name, role: person.role, state: 'idle', cards: [], waitingOn: [] }
    }
    const gate = [...cardsIn('review'), ...cardsIn('inbox')]
    return { key: person.key, name: person.name, role: person.role, state: gate.length ? 'reviewing' : 'idle', cards: gate, waitingOn: [] }
  })
}
