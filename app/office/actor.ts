// One person in the office: a rig posed by hand every frame, a queue of errands run one after the
// other, and a habit of their own while sitting at the desk.
import * as THREE from 'three'
import { deskLightOf } from '../../shared/office/model'
import type { Activity, OfficePerson, PersonStatus, Role } from '../../shared/office/model'
import type { Heading, P } from './layout'
import type { Rig } from './meshes'
import { buildPerson, textSprite } from './meshes'

const LIGHT_RADIUS = 0.28

/**
 * The desk light: a filled dot for busy, a ring for idle, a dashed ring for unknown. The three shapes differ, so the
 * light never relies on colour alone. Every piece carries the person's key, so hovering the light finds the person.
 */
function buildDeskLight(key: string): { group: THREE.Group, dot: THREE.Mesh, ring: THREE.Mesh, dashed: THREE.Group } {
  const group = new THREE.Group()
  const dot = new THREE.Mesh(new THREE.SphereGeometry(LIGHT_RADIUS, 16, 12), new THREE.MeshBasicMaterial())
  const ring = new THREE.Mesh(new THREE.TorusGeometry(LIGHT_RADIUS * 0.7, LIGHT_RADIUS * 0.28, 8, 24), new THREE.MeshBasicMaterial())
  const dashed = new THREE.Group()
  const dashGeometry = new THREE.SphereGeometry(LIGHT_RADIUS * 0.22, 8, 6)
  const dashMaterial = new THREE.MeshBasicMaterial()
  for (let i = 0; i < 8; i++) {
    const dash = new THREE.Mesh(dashGeometry, dashMaterial)
    dash.position.set(Math.cos(i * Math.PI / 4) * LIGHT_RADIUS * 0.7, Math.sin(i * Math.PI / 4) * LIGHT_RADIUS * 0.7, 0)
    dashed.add(dash)
  }
  group.add(dot, ring, dashed)
  group.traverse((o) => {
    o.userData.actorKey = key
  })
  return { group, dot, ring, dashed }
}

// Scratch for levelDrink, shared because only one actor is posed at a time.
const UPRIGHT = new THREE.Quaternion()
const TILT = new THREE.Quaternion()
const HAND = new THREE.Quaternion()
const X_AXIS = new THREE.Vector3(1, 0, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)

export type Gesture = 'reach' | 'knock' | 'startle' | 'facepalm' | 'cheer' | 'scratch' | 'drink' | 'stomp' | 'shrug' | 'stretch' | 'wave' | 'swing' | 'putt' | 'sweep'
export type WorkStyle = 'type' | 'frantic' | 'hammer' | 'duck' | 'coffee' | 'wrench' | 'spin'
/** What an idle person does at the desk. Ping-pong is not on the list: it needs two, so the office starts it. */
export type IdleStyle = 'doze' | 'phone' | 'game'

/** Something worth a bubble or a puff of particles, raised while the actor works or idles. */
export type Beat = 'zzz' | 'bonk' | 'keys' | 'duck' | 'sip' | 'clank' | 'spin' | 'scribble' | 'stamp' | 'peer' | 'read' | 'shuffle' | 'eye' | 'idle' | 'scroll' | 'pew'

/** Each worker's own way of getting things done; anyone else gets a mix. */
const STYLES: Record<string, WorkStyle[]> = {
  wren: ['frantic', 'type', 'frantic'],
  wick: ['hammer', 'hammer', 'type'],
  wynn: ['duck', 'type', 'wrench'],
  wade: ['coffee', 'type', 'spin']
}
const ANY_STYLES: WorkStyle[] = ['type', 'frantic', 'hammer', 'duck', 'coffee', 'wrench', 'spin']

/** How each person likes to waste time; listed twice is twice as likely. Anyone else gets a mix. */
const IDLE_STYLES: Record<string, IdleStyle[]> = {
  pia: ['phone', 'phone', 'doze'],
  wren: ['phone', 'game', 'phone'],
  wick: ['game', 'game', 'doze'],
  wynn: ['doze', 'phone', 'game'],
  wade: ['game', 'phone', 'doze'],
  // The Boss never dozes: he is out golfing or making the rounds, and between those he is on the phone.
  boss: ['phone']
}
const ANY_IDLE: IdleStyle[] = ['doze', 'phone', 'game']

const GESTURE_SECONDS: Record<Gesture, number> = {
  reach: 0.45, knock: 0.9, startle: 0.7, facepalm: 1.4, cheer: 1.3, scratch: 1.3, drink: 1.8, stomp: 0.9, shrug: 0.9, stretch: 1.6, wave: 1.0, swing: 0.35, putt: 1.1, sweep: 2.4
}

/** The gestures a person can be given, in the order the table lists them. Tests pin that every one has a length. */
export const GESTURE_NAMES = Object.keys(GESTURE_SECONDS) as Gesture[]

/**
 * The state of a janitor at a desk, from the cleanup flow on the card: she walks there while the plan is being made,
 * stands by at the desk while the checker looks, and sweeps while the granted steps run. Anything else is no state.
 */
export type CleaningState = 'walk' | 'stand' | 'sweep' | null
export function cleaningStateOf(tags: readonly string[]): CleaningState {
  if (tags.includes('cleaned')) return null
  if (tags.includes('cleaning granted')) return 'sweep'
  if (tags.includes('clean plan')) return 'stand'
  if (tags.includes('ready to clean')) return 'walk'
  return null
}

/** What a role does once it has walked its route: stand by, sweep, or nothing. */
export type AfterWalk = 'stand' | 'sweep' | 'none'

/**
 * One role's walk for one state: the points to walk through in order, then what the role does at the end. A stop has a
 * length in seconds (`stopSeconds`); a badge is a count the office shows at the role's desk (Susy's pokes, Janet's
 * cleaned). Both are data, so the actor does not know any role.
 */
export interface WalkPlan {
  points: P[]
  then: AfterWalk
  stopSeconds?: number
  badge?: number
}

/**
 * A role's piece. Its state is read from the data the office has for that role; its plan is made from the state. The
 * state's shape is the role's own (Janet's is her cleanup state, Susy's is the person she poked).
 */
export interface RolePiece<D, S> {
  stateOf: (data: D) => S | null
  plan: (state: S) => WalkPlan | null
}

/**
 * The route registry. Each role's piece registers under its crew key in its own file; nobody edits the shared lines to
 * add one. A key may register once: a second registration is an error, not a silent replacement.
 */
export interface RouteRegistry {
  register: <D, S>(key: string, piece: RolePiece<D, S>) => void
  planFor: (key: string, data: unknown) => WalkPlan | null
  /** Where a crew key's desk is, on the office floor; the office sets it from its layout. */
  setDeskLookup: (lookup: (personKey: string) => P | null) => void
  /** The target point for walking to a person's desk, or null when the office has no such desk. */
  deskOf: (personKey: string) => P | null
  /** A walk to a person's desk, then `then`; null when there is no desk to walk to. */
  walkToDesk: (personKey: string, then: AfterWalk, extra?: Partial<WalkPlan>) => WalkPlan | null
  keys: () => string[]
}

export function createRouteRegistry(): RouteRegistry {
  const pieces = new Map<string, (data: unknown) => WalkPlan | null>()
  let lookup: (personKey: string) => P | null = () => null
  return {
    register(key, piece) {
      if (!/^[a-z][a-z0-9-]*$/.test(key)) throw new Error(`"${key}" is not a crew key`)
      if (pieces.has(key)) throw new Error(`a route is already registered for "${key}"`)
      pieces.set(key, (data) => {
        const state = piece.stateOf(data as never)
        return state === null ? null : piece.plan(state)
      })
    },
    planFor(key, data) {
      return pieces.get(key)?.(data) ?? null
    },
    setDeskLookup(fn) {
      lookup = fn
    },
    deskOf: personKey => lookup(personKey),
    walkToDesk(personKey, then, extra = {}) {
      const desk = lookup(personKey)
      return desk ? { points: [desk], then, ...extra } : null
    },
    keys: () => [...pieces.keys()]
  }
}

/** The office's own registry: the role pieces register here, in their own files. */
export const routes = createRouteRegistry()

/** Walks a plan with an actor: the route, then the stop, then what the role does at the end. */
export async function followPlan(
  actor: Pick<Actor, 'walk' | 'play'>,
  plan: WalkPlan,
  wait: (seconds: number) => Promise<void> = async () => {}
): Promise<void> {
  if (plan.points.length) await actor.walk(plan.points)
  if (plan.stopSeconds) await wait(plan.stopSeconds)
  if (plan.then === 'sweep') await actor.play('sweep')
}

/**
 * Turns a sharp corner of a path into two gentler ones. Where the path turns back on itself by more than about 110
 * degrees at a point, the body would snap round in a single stride; instead the corner is cut on both legs by up to
 * `radius` metres, so each of the two turns is about half the angle and the body turns over a stride or two. Only the
 * sharp corners change: the first point stays, and nothing is added at the end.
 */
export function roundSharpCorners(points: P[], radius = 0.6, sharp = -0.4): P[] {
  if (points.length < 3) return points.slice()
  const out: P[] = [points[0]!]
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!
    const cur = points[i]!
    const next = points[i + 1]!
    const ax = cur.x - prev.x
    const az = cur.z - prev.z
    const bx = next.x - cur.x
    const bz = next.z - cur.z
    const la = Math.hypot(ax, az)
    const lb = Math.hypot(bx, bz)
    const cos = la && lb ? (ax * bx + az * bz) / (la * lb) : 1
    if (cos >= sharp) {
      out.push(cur)
      continue
    }
    const r = Math.min(radius, la / 2, lb / 2)
    out.push({ x: cur.x - (ax / la) * r, z: cur.z - (az / la) * r }, { x: cur.x + (bx / lb) * r, z: cur.z + (bz / lb) * r })
  }
  out.push(points[points.length - 1]!)
  return out
}

/** What each role has printed on the back of the shirt; the name tag above the head stays the first name. */
const BACK_PRINT: Record<Role, string> = { pm: 'PM', worker: 'WORKER', ux: 'UX', cq: 'CQ', qa: 'QA', boss: 'BOSS' }

const WALK_SPEED = 3.4
/** How long a change of pose (sitting down, idle to work, one habit to the next) takes to settle. */
const BLEND_SECONDS = 0.45

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

export class Actor {
  readonly rig: Rig
  readonly person: OfficePerson
  readonly label: THREE.Sprite
  /** The desk light above the name, and what it says: "Busy: ...", "Idle since ...", or "No status yet". */
  readonly light: { group: THREE.Group, dot: THREE.Mesh, ring: THREE.Mesh, dashed: THREE.Group }
  statusText = 'No status yet'
  seat: P
  facing: Heading
  activity: Activity = 'idle'
  idleStyle: IdleStyle = 'doze'
  /** Set while standing at the ping-pong table: shows the paddle and the ready stance. */
  playing = false
  /** Walking pace on top of the usual; the courier is in a hurry. */
  speed = 1
  /** The chair at this person's desk, turned along with them while they sit in it. */
  chair: THREE.Object3D | null = null
  private chairBase: number | null = null
  /** Set while the person is away from the desk on an errand. */
  away = false
  carrying: THREE.Object3D | null = null
  /** Something kept in hand for a while, like the Boss's putter; shown whenever no habit needs the hand. */
  tool: string | null = null
  /** Set while standing over the ball: both hands on the putter, side-on to the hole. */
  stance: 'putt' | null = null
  /** Bent over after something loose on the floor: low, with the hands reaching. */
  stooped = false
  /** Multiplier on the walking pace; below 1 for creeping up on something. */
  pace = 1
  onBeat: (beat: Beat, actor: Actor) => void = () => {}

  private heading: Heading
  private sitting = true
  private path: P[] = []
  private steering = false
  private walkDone: (() => void) | null = null
  private gesture: { name: Gesture, t0: number, dur: number, done: () => void } | null = null
  private queue: Promise<void> = Promise.resolve()
  private pending = 0
  private style: WorkStyle
  private styleUntil = 0
  private nextBeat = 0
  private lastSwing = 0
  private spinStart = -10
  private idleUntil = 0
  /** Extra turn of the chair on top of the heading: the phone scroller swivels. */
  private swivel = 0
  /** How far the putter hangs off the vertical, along the line to the hole; positive is towards the hole. */
  private swingAngle = 0
  private time = 0
  private readonly seed: number
  /** Which kind of pose the rig is in; a change starts a blend from the last pose shown. */
  private poseKey = ''
  private lastPose: number[] = []
  private blendFrom: number[] | null = null
  private blendT = 1

  constructor(person: OfficePerson, seat: P, facing: Heading) {
    this.person = person
    this.rig = buildPerson(person.key, person.key === 'courier' ? 'COURIER' : BACK_PRINT[person.role])
    this.seat = seat
    this.facing = facing
    this.heading = facing
    this.seed = Math.random() * 100
    this.style = (STYLES[person.key] ?? ANY_STYLES)[0]!
    this.idleStyle = (IDLE_STYLES[person.key] ?? ANY_IDLE)[0]!
    const first = person.name.split(/\s+/)[0] ?? person.name
    this.label = textSprite(first, { bg: 'rgba(255,255,255,0.9)', fg: '#1d1d1f', height: 0.62, border: '#00000022' })
    this.label.position.y = 2.95
    this.rig.root.add(this.label)
    this.light = buildDeskLight(person.key)
    this.light.group.position.set(0.95, 2.95, 0)
    this.rig.root.add(this.light.group)
    this.setStatus(person.status)
    this.rig.root.position.set(seat.x, 0, seat.z)
    this.rig.root.rotation.y = facing
    this.rig.root.traverse((o) => {
      o.userData.actorKey = person.key
    })
  }

  /** The desk light follows the status: a dot for busy, a ring for idle, a dashed ring while unknown. */
  setStatus(status: PersonStatus | undefined): void {
    const { color, shape, text } = deskLightOf(status)
    this.statusText = text
    this.light.dot.visible = shape === 'dot'
    this.light.ring.visible = shape === 'ring'
    this.light.dashed.visible = shape === 'dashed'
    this.light.group.traverse((o) => {
      const material = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined
      material?.color.set(color)
    })
  }

  get key(): string {
    return this.person.key
  }

  get position(): THREE.Vector3 {
    return this.rig.root.position
  }

  get busy(): boolean {
    return this.pending > 0
  }

  get queued(): number {
    return this.pending
  }

  /** Carrying a coffee or a cup of water back from the machine. */
  get holdsDrink(): boolean {
    return this.tool === 'mug' || this.tool === 'cup'
  }

  /** Runs `job` after everything queued before it. Failures are swallowed so one bad errand cannot jam the queue. */
  enqueue(job: () => Promise<void>): Promise<void> {
    this.pending++
    const run = this.queue.then(job).catch((e) => {
      console.warn('[office] errand failed', e)
    }).finally(() => {
      this.pending--
    })
    this.queue = run
    return run
  }

  /** Whether the legs are carrying them somewhere right now. */
  get walking(): boolean {
    return this.path.length > 0
  }

  /**
   * Keeps walking toward a point that moves, such as a rolling ball. Unlike walk() it replaces the target
   * without resolving anything and never counts as arriving, so the walk cycle does not stop and start
   * each time the person catches up. Ends with settle().
   */
  steer(p: P) {
    this.sitting = false
    this.away = true
    this.steering = true
    this.path = [p]
  }

  /** Ends a steer(): the one stop of a chase. */
  settle() {
    if (!this.steering) return
    this.steering = false
    this.path = []
  }

  walk(points: P[]): Promise<void> {
    if (!points.length) return Promise.resolve()
    this.steering = false
    this.sitting = false
    this.away = true
    this.walkDone?.()
    this.path = points.slice()
    return new Promise((resolve) => {
      this.walkDone = resolve
    })
  }

  play(name: Gesture, seconds?: number): Promise<void> {
    this.gesture?.done()
    return new Promise((resolve) => {
      this.gesture = { name, t0: this.time, dur: seconds ?? GESTURE_SECONDS[name], done: resolve }
    })
  }

  face(heading: Heading) {
    this.heading = heading
  }

  faceToward(p: P) {
    const dx = p.x - this.position.x
    const dz = p.z - this.position.z
    if (Math.hypot(dx, dz) > 0.01) this.heading = Math.atan2(dx, dz)
  }

  sitDown() {
    this.sitting = true
    this.away = false
    this.rig.root.position.set(this.seat.x, 0, this.seat.z)
    this.heading = this.facing
  }

  hold(object: THREE.Object3D | null) {
    if (this.carrying && this.carrying !== object) this.rig.carry.remove(this.carrying)
    this.carrying = object
    if (object) {
      object.position.set(0, 0, 0)
      object.rotation.set(0, 0, 0)
      this.rig.carry.add(object)
    }
  }

  private showProp(name: string | null) {
    for (const [key, prop] of Object.entries(this.rig.props)) prop.visible = key === name
  }

  private beat(beat: Beat, every: number) {
    if (this.time >= this.nextBeat) {
      this.nextBeat = this.time + every * (0.7 + Math.random() * 0.6)
      this.onBeat(beat, this)
    }
  }

  update(dt: number) {
    this.time += dt
    const t = this.time + this.seed
    const r = this.rig
    const root = r.root

    // Start from a neutral pose every frame; each branch below only says what differs.
    r.body.position.y = 0
    r.body.rotation.set(0, 0, 0)
    r.torso.rotation.set(0, 0, 0)
    r.head.rotation.set(0, 0, 0)
    r.armL.rotation.set(0, 0, 0.08)
    r.armR.rotation.set(0, 0, -0.08)
    r.legL.rotation.set(0, 0, 0)
    r.legR.rotation.set(0, 0, 0)
    this.swivel = 0
    this.swingAngle = 0
    let prop: string | null = null

    if (this.path.length) {
      const target = this.path[0]!
      const dx = target.x - root.position.x
      const dz = target.z - root.position.z
      const dist = Math.hypot(dx, dz)
      const step = WALK_SPEED * this.speed * this.pace * dt
      if (dist <= step) {
        root.position.x = target.x
        root.position.z = target.z
        // A chase never arrives: it only ends through settle(), so catching up with a moving target is not a stop.
        if (!this.steering) {
          this.path.shift()
          if (!this.path.length) {
            const done = this.walkDone
            this.walkDone = null
            done?.()
          }
        }
      } else {
        root.position.x += (dx / dist) * step
        root.position.z += (dz / dist) * step
        this.heading = Math.atan2(dx, dz)
      }
      // Creeping bent over takes small, slow steps.
      const rate = this.stooped ? 6 : 11
      const swing = Math.sin(t * rate)
      const reach = this.stooped ? 0.3 : 0.6
      r.legL.rotation.x = swing * reach
      r.legR.rotation.x = -swing * reach
      r.body.position.y = this.stooped ? -0.3 + Math.abs(Math.cos(t * rate)) * 0.02 : Math.abs(Math.cos(t * 11)) * 0.07
      if (this.stooped) {
        this.poseStooped(t)
      } else if (this.carrying) {
        r.armL.rotation.x = -1.25
        r.armR.rotation.x = -1.25
      } else {
        // A drink is carried in front, steady, not swung.
        r.armL.rotation.x = this.holdsDrink ? -0.9 : -swing * 0.5
        r.armR.rotation.x = swing * 0.5
      }
    } else if (this.sitting) {
      r.body.position.y = -0.38
      r.legL.rotation.x = -1.45
      r.legR.rotation.x = -1.45
      if (!this.gesture) prop = this.poseSeated(t)
    } else if (this.stooped) {
      r.body.position.y = -0.3
      r.legL.rotation.x = 0.6
      r.legR.rotation.x = -0.35
      this.poseStooped(t)
    } else if (this.carrying) {
      r.armL.rotation.x = -1.25
      r.armR.rotation.x = -1.25
    } else if (this.stance === 'putt') {
      this.poseAddress()
    } else if (this.holdsDrink) {
      r.armL.rotation.x = -0.9
    } else if (this.playing) {
      // Ready stance at the table: knees bent, paddle up, a little bounce on the toes.
      r.body.position.y = -0.08 + Math.abs(Math.sin(t * 5)) * 0.04
      r.legL.rotation.x = 0.25
      r.legR.rotation.x = -0.2
      r.torso.rotation.x = 0.2
      r.armR.rotation.x = -1.0
      r.armR.rotation.z = -0.5
      r.armL.rotation.x = -0.6
      r.armL.rotation.z = 0.4
    }

    if (this.gesture) this.poseGesture(t)
    this.blendPose(dt)

    // Chair spins are a seated habit, so they turn the whole person.
    const spin = this.time - this.spinStart
    if (spin < 1.2) root.rotation.y = this.heading + (spin / 1.2) * Math.PI * 2
    else root.rotation.y = lerpAngle(root.rotation.y, this.heading + this.swivel, Math.min(1, dt * 10))
    // The chair follows every turn made while seated (swivels, spins) and squares up again when left empty.
    if (this.chair) {
      this.chairBase ??= this.chair.rotation.y
      this.chair.rotation.y = this.chairBase + (this.sitting ? root.rotation.y - this.facing : 0)
    }
    // A drink is a mug unless they brought a paper cup back from the cooler.
    const drinkProp = this.tool === 'cup' ? 'cup' : 'mug'
    this.showProp(this.gesture?.name === 'drink' ? drinkProp : this.gesture?.name === 'sweep' ? 'broom' : this.playing ? 'paddle' : this.tool ?? prop)
    this.levelDrink()
    this.levelPutter()
  }

  /** Bent over after a ball on the floor: hips forward, hands low and reaching. */
  private poseStooped(t: number) {
    const r = this.rig
    // Bent forward at the hips, head up to keep an eye on the ball, hands low and feeling for it.
    r.torso.rotation.x = 1.15
    r.head.rotation.x = -0.8
    r.armL.rotation.x = -1.15
    r.armR.rotation.x = -1.3 + Math.sin(t * 3) * 0.08
    r.armL.rotation.z = 0.12
    r.armR.rotation.z = -0.12
  }

  /** Bent over the ball, both hands together on the grip. */
  private poseAddress() {
    const r = this.rig
    r.torso.rotation.x = 0.5
    r.head.rotation.x = 0.4
    r.armL.rotation.x = -0.75
    r.armR.rotation.x = -0.75
    r.armL.rotation.z = 0.7
    r.armR.rotation.z = -0.7
    r.legL.rotation.x = 0.12
    r.legR.rotation.x = -0.12
  }

  /**
   * Over the ball the putter hangs from both hands like a pendulum, leaning a little towards the ball, however
   * the arms are bent; the swing angle swings its head along the line to the hole. Otherwise it is just carried.
   */
  private levelPutter() {
    const putter = this.rig.props.putter
    if (!putter) return
    if (this.stance !== 'putt' || !putter.visible) {
      putter.quaternion.identity()
      return
    }
    this.rig.root.updateMatrixWorld(true)
    this.rig.root.getWorldQuaternion(UPRIGHT)
    UPRIGHT.multiply(TILT.setFromAxisAngle(Z_AXIS, this.swingAngle)).multiply(TILT.setFromAxisAngle(X_AXIS, -0.3))
    this.rig.handR.getWorldQuaternion(HAND).invert()
    putter.quaternion.copy(HAND.multiply(UPRIGHT))
  }

  /**
   * A mug or a cup stays upright whatever the arm does, so nothing spills on the way back from the machine.
   * It tips towards the mouth only once the hand is up there.
   */
  private levelDrink() {
    const r = this.rig
    const held = [r.props.mug, r.props.cup].find(p => p?.visible)
    if (!held) return
    r.root.updateMatrixWorld(true)
    const sip = Math.min(1, Math.max(0, (-r.armL.rotation.x - 1.6) / 0.7))
    r.root.getWorldQuaternion(UPRIGHT).multiply(TILT.setFromAxisAngle(X_AXIS, -0.6 * sip))
    r.handL.getWorldQuaternion(HAND).invert()
    held.quaternion.copy(HAND.multiply(UPRIGHT))
  }

  /** The seated habit for what the person is doing now. Returns the prop in hand. */
  private poseSeated(t: number): string | null {
    const r = this.rig
    switch (this.activity) {
      case 'idle':
        return this.poseIdle(t)
      case 'eyeing-todo': {
        r.head.rotation.y = this.person.role === 'worker' ? -0.7 : 0.7
        r.head.rotation.z = Math.sin(t * 2) * 0.08
        r.armR.rotation.x = -1.3 + Math.abs(Math.sin(t * 9)) * 0.12
        r.armL.rotation.x = -1.2
        this.beat('eye', 5)
        return null
      }
      case 'working':
        return this.poseWork(t)
      case 'reviewing':
        return this.poseReview(t)
      case 'sorting':
      case 'triaging': {
        const shuffle = Math.sin(t * 3)
        r.armL.rotation.x = -1.3
        r.armR.rotation.x = -1.3
        r.armL.rotation.z = 0.3 + shuffle * 0.25
        r.armR.rotation.z = -0.3 + shuffle * 0.25
        r.head.rotation.x = 0.25
        r.head.rotation.y = shuffle * 0.2
        this.beat(this.activity === 'triaging' ? 'peer' : 'shuffle', 6)
        return this.activity === 'triaging' ? 'magnifier' : null
      }
    }
  }

  /** The kind of pose the rig is in now. Only a change of kind blends; the motion within one stays as it is. */
  private poseKind(): string {
    if (this.path.length) return this.carrying ? 'walk-carry' : this.stooped ? 'walk-stoop' : 'walk'
    if (this.sitting) {
      const habit = this.activity === 'idle' ? this.idleStyle : this.activity === 'working' ? this.style : ''
      return `sit:${this.activity}:${habit}`
    }
    return this.carrying ? 'carry' : this.stooped ? 'stoop' : this.stance ? 'address' : this.playing ? 'play' : 'stand'
  }

  /**
   * Eases from the last pose shown into the new one when the kind of pose changes, so nobody snaps from
   * a doze into typing or from walking into the chair. The new pose keeps moving underneath the blend.
   */
  private blendPose(dt: number) {
    const r = this.rig
    const parts = [r.body, r.torso, r.head, r.armL, r.armR, r.legL, r.legR]
    const now = [r.body.position.y]
    for (const part of parts) now.push(part.rotation.x, part.rotation.y, part.rotation.z)
    const kind = this.poseKind()
    if (kind !== this.poseKey) {
      if (this.poseKey && this.lastPose.length === now.length) {
        this.blendFrom = this.lastPose
        this.blendT = 0
      }
      this.poseKey = kind
    }
    const from = this.blendFrom
    if (from && this.blendT < 1) {
      this.blendT = Math.min(1, this.blendT + dt / BLEND_SECONDS)
      const k = this.blendT * this.blendT * (3 - 2 * this.blendT)
      for (let i = 0; i < now.length; i++) now[i] = from[i]! + (now[i]! - from[i]!) * k
      r.body.position.y = now[0]!
      parts.forEach((part, i) => part.rotation.set(now[1 + i * 3]!, now[2 + i * 3]!, now[3 + i * 3]!))
    }
    this.lastPose = now
  }

  /** Whether a knock is needed to get this person's attention. */
  get dozing(): boolean {
    return this.activity === 'idle' && this.idleStyle === 'doze' && !this.playing
  }

  /** Picks a new way to waste time now and then, so an idle office does not freeze into one picture. */
  private pickIdle() {
    if (this.time < this.idleUntil) return
    const styles = IDLE_STYLES[this.person.key] ?? ANY_IDLE
    this.idleStyle = styles[Math.floor(Math.random() * styles.length)]!
    this.idleUntil = this.time + 14 + Math.random() * 18
  }

  private poseIdle(t: number): string | null {
    const r = this.rig
    this.pickIdle()
    switch (this.idleStyle) {
      case 'phone': {
        // Leaned back, phone up, thumb flicking, the chair swivelling slowly left and right.
        this.swivel = Math.sin(t * 0.7) * 0.7
        r.torso.rotation.x = -0.18
        r.head.rotation.x = 0.45
        r.armL.rotation.x = -1.75
        r.armL.rotation.z = 0.45
        r.armR.rotation.x = -1.65 + Math.abs(Math.sin(t * 6)) * 0.1
        r.armR.rotation.z = -0.35
        r.legL.rotation.x = -1.2
        r.legR.rotation.x = -1.6
        this.beat('scroll', 3.5)
        return 'phone'
      }
      case 'game': {
        // Hunched over the keyboard, mouse hand twitching, bouncing in the chair at every kill.
        const twitch = Math.sin(t * 17) * 0.18 + Math.sin(t * 5.3) * 0.12
        r.torso.rotation.x = 0.32
        r.head.rotation.x = 0.1
        r.head.rotation.y = twitch * 0.3
        r.armL.rotation.x = -1.35 + Math.sin(t * 21) * 0.05
        r.armL.rotation.z = 0.3
        r.armR.rotation.x = -1.3
        r.armR.rotation.y = twitch
        r.armR.rotation.z = -0.35
        r.body.position.y += Math.max(0, Math.sin(t * 2.3)) > 0.97 ? 0.08 : 0
        this.beat('pew', 1.6)
        return null
      }
      default:
        r.torso.rotation.x = 0.62 + Math.sin(t * 1.4) * 0.03
        r.head.rotation.x = 0.35
        r.head.rotation.z = 0.25
        r.armL.rotation.x = -1.6
        r.armR.rotation.x = -1.6
        r.armL.rotation.z = 0.5
        r.armR.rotation.z = -0.5
        this.beat('zzz', 2.2)
        return null
    }
  }

  private poseWork(t: number): string | null {
    const r = this.rig
    if (this.time > this.styleUntil) {
      const styles = STYLES[this.person.key] ?? ANY_STYLES
      this.style = styles[Math.floor(Math.random() * styles.length)]!
      this.styleUntil = this.time + 6 + Math.random() * 6
      if (this.style === 'spin') this.spinStart = this.time
    }
    const typing = (speed: number, size: number) => {
      r.armL.rotation.x = -1.3 + Math.sin(t * speed) * size
      r.armR.rotation.x = -1.3 + Math.sin(t * speed + Math.PI) * size
      r.armL.rotation.z = 0.25
      r.armR.rotation.z = -0.25
    }
    switch (this.style) {
      case 'frantic':
        typing(38, 0.16)
        r.torso.rotation.x = 0.2
        r.head.rotation.x = 0.15 + Math.sin(t * 19) * 0.06
        r.body.position.y += Math.sin(t * 40) * 0.015
        this.beat('keys', 0.9)
        return null
      case 'hammer': {
        // A slow wind-up and a fast swing down onto the keyboard.
        const phase = (t * 1.6) % 1
        const up = phase < 0.75 ? phase / 0.75 : 1 - (phase - 0.75) / 0.25
        r.armR.rotation.x = -1.15 - up * 1.75
        r.armL.rotation.x = -1.2
        r.torso.rotation.x = 0.1 + (1 - up) * 0.15
        if (phase > 0.97 && this.time - this.lastSwing > 0.4) {
          this.lastSwing = this.time
          this.onBeat('bonk', this)
        }
        return 'hammer'
      }
      case 'duck':
        r.head.rotation.y = 0.6
        r.head.rotation.x = Math.sin(t * 6) * 0.1
        r.armR.rotation.x = -0.9 + Math.sin(t * 3) * 0.3
        r.armR.rotation.z = -0.5
        r.armL.rotation.x = -1.2
        this.beat('duck', 2.6)
        return null
      case 'coffee': {
        typing(24, 0.12)
        const sip = (t * 0.5) % 1
        if (sip < 0.3) {
          r.armL.rotation.x = -2.3
          r.armL.rotation.z = 0.9
          r.head.rotation.x = -0.25
          if (sip < 0.02) this.onBeat('sip', this)
        }
        return sip < 0.3 ? 'mug' : null
      }
      case 'wrench':
        r.armR.rotation.x = -1.4
        r.armR.rotation.y = Math.sin(t * 8) * 0.5
        r.armL.rotation.x = -1.3
        r.torso.rotation.x = 0.25
        this.beat('clank', 1.1)
        return 'wrench'
      case 'spin':
        typing(20, 0.1)
        this.beat('spin', 8)
        if (this.time - this.spinStart > 5) this.spinStart = this.time
        return null
      default:
        typing(22, 0.1)
        r.head.rotation.x = 0.1
        this.beat('keys', 1.8)
        return null
    }
  }

  private poseReview(t: number): string | null {
    const r = this.rig
    switch (this.person.role) {
      case 'ux':
        r.armR.rotation.x = -1.4
        r.armR.rotation.y = Math.sin(t * 1.5) * 0.6
        r.head.rotation.y = Math.sin(t * 1.5) * 0.4
        r.torso.rotation.x = 0.3
        this.beat('peer', 3)
        return 'magnifier'
      case 'cq':
        r.armR.rotation.x = -1.2 + Math.sin(t * 14) * 0.08
        r.armR.rotation.z = -0.3 + Math.cos(t * 14) * 0.08
        r.armL.rotation.x = -1.2
        r.torso.rotation.x = 0.35
        r.head.rotation.x = 0.3
        this.beat('scribble', 1.6)
        return 'pen'
      case 'qa': {
        const phase = (t * 0.9) % 1
        const up = phase < 0.8 ? phase / 0.8 : 1 - (phase - 0.8) / 0.2
        r.armR.rotation.x = -1.1 - up * 1.3
        r.armL.rotation.x = -1.2
        if (phase > 0.97 && this.time - this.lastSwing > 0.6) {
          this.lastSwing = this.time
          this.onBeat('stamp', this)
        }
        return 'stamp'
      }
      default:
        // The Boss leans back and reads with both hands, as bosses do.
        r.torso.rotation.x = -0.3
        r.armL.rotation.x = -1.9
        r.armR.rotation.x = -1.9
        r.armL.rotation.z = 0.3
        r.armR.rotation.z = -0.3
        r.head.rotation.x = -0.1
        this.beat('read', 4)
        return null
    }
  }

  private poseGesture(t: number) {
    const g = this.gesture!
    const r = this.rig
    const k = Math.min(1, (this.time - g.t0) / g.dur)
    const hump = Math.sin(k * Math.PI)
    switch (g.name) {
      case 'reach':
        r.armL.rotation.x = -1.5 * hump - (this.carrying ? 1.25 * (1 - hump) : 0)
        r.armR.rotation.x = -1.5 * hump - (this.carrying ? 1.25 * (1 - hump) : 0)
        r.torso.rotation.x = 0.35 * hump
        break
      case 'knock':
        r.armR.rotation.x = -1.7 + Math.abs(Math.sin(k * Math.PI * 4)) * 0.3
        break
      case 'startle':
        r.body.position.y += hump * 0.45
        r.armL.rotation.z = 2.4 * hump
        r.armR.rotation.z = -2.4 * hump
        break
      case 'facepalm':
        r.armR.rotation.x = -2.5 * hump
        r.armR.rotation.z = 0.55 * hump
        r.head.rotation.x = 0.4 * hump
        break
      case 'cheer':
        r.body.position.y += Math.abs(Math.sin(k * Math.PI * 3)) * 0.35
        r.armL.rotation.z = 2.7 * hump
        r.armR.rotation.z = -2.7 * hump
        break
      case 'scratch':
        r.armR.rotation.x = -2.6 * hump
        r.armR.rotation.z = 0.3 + Math.sin(t * 20) * 0.15 * hump
        r.head.rotation.z = 0.2 * hump
        break
      case 'drink':
        r.armL.rotation.x = -2.3 * hump
        r.armL.rotation.z = 0.9 * hump
        r.head.rotation.x = -0.3 * hump
        break
      case 'stomp':
        r.body.position.y += Math.abs(Math.sin(k * Math.PI * 4)) * 0.2
        r.armL.rotation.z = -0.4 * hump
        r.armR.rotation.z = 0.4 * hump
        r.armL.rotation.x = -0.5 * hump
        r.armR.rotation.x = -0.5 * hump
        break
      case 'shrug':
        r.armL.rotation.z = 0.9 * hump
        r.armR.rotation.z = -0.9 * hump
        r.armL.rotation.x = -0.8 * hump
        r.armR.rotation.x = -0.8 * hump
        r.head.rotation.z = 0.2 * hump
        break
      case 'stretch':
        r.armL.rotation.z = 2.9 * hump
        r.armR.rotation.z = -2.9 * hump
        r.torso.rotation.x = -0.2 * hump
        break
      case 'swing':
        // A forehand: the paddle arm sweeps across the body and up.
        r.armR.rotation.x = -1.0 - hump * 0.9
        r.armR.rotation.y = -1.2 + k * 2.0
        r.armR.rotation.z = -0.5
        r.torso.rotation.y = -0.4 + k * 0.8
        r.torso.rotation.x = 0.2
        break
      case 'putt': {
        // Both hands on the grip, side-on to the hole: the club swings like a pendulum along the line to it,
        // a slow back-swing (away from the hole), through the ball at k = 0.73, then a short follow-through.
        const ease = (x: number) => x * x * (3 - 2 * x)
        const swing = k < 0.5
          ? -0.4 * ease(k / 0.5)
          : k < 0.73 ? -0.4 * (1 - ease((k - 0.5) / 0.23)) : 0.3 * ease(Math.min(1, (k - 0.73) / 0.2))
        this.poseAddress()
        this.swingAngle = swing
        r.torso.rotation.y = swing * 0.5
        break
      }
      case 'wave':
        r.armR.rotation.z = -2.6 * hump + Math.sin(t * 14) * 0.25 * hump
        break
      case 'sweep':
        // The broom in the right hand, the body leaning into a stroke that goes back and forth across the floor.
        r.armR.rotation.x = -0.9 * hump
        r.armL.rotation.x = -0.6 * hump
        r.torso.rotation.x = 0.25 * hump
        r.torso.rotation.y = Math.sin(t * 5) * 0.25 * hump
        break
    }
    if (k >= 1) {
      const done = this.gesture!.done
      this.gesture = null
      done()
    }
  }
}
