// The office itself: builds the scene, turns each new board snapshot into errands, and plays them.
// The board decides where the folders end up; this file only decides how they get there.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  activityOf, castWithStandIns, describeErrand, errandsBetween, ownerOf, pingsBetween, placeOf,
  JAR, SHELF, SHREDDER
} from '../../shared/office/model'
import type { Errand, OfficePerson, OfficeSnapshot, Place } from '../../shared/office/model'
import { Actor, roundSharpCorners, routes } from './actor'
import type { Beat, IdleStyle } from './actor'
import './roles/janet'
import './roles/pat'
import './roles/rita'
import './roles/susy'
import './roles/tess'
import { stepBall } from './ballistics'
import type { BallWorld } from './ballistics'
import { buildLayout, FIXTURES, GOLF, ROOM } from './layout'
import type { Layout, P, P3 } from './layout'
import {
  buildBossOffice, buildBug, buildCubicle, buildFixtures, buildFolder, buildParcel, buildPiaDesk, buildRoom, flairOf, lookOf,
  textSprite
} from './meshes'
import type { DeskParts, Fixtures, Painted, Room } from './meshes'

export interface HoverInfo {
  kind: 'folder' | 'person'
  title: string
  detail: string
  x: number
  y: number
}

export interface OfficeHooks {
  onTicker?: (line: string) => void
  onHover?: (info: HoverInfo | null) => void
  /** Builds the renderer; tests pass one that draws nothing, so the scene runs without WebGL. */
  renderer?: () => THREE.WebGLRenderer
}

interface Folder {
  id: string
  title: string
  column: string
  obj: THREE.Group
  /** Null while someone carries it. */
  place: Place | null
  /** Arrival order within its place, so stacks do not reshuffle. */
  order: number
}

interface Floater {
  obj: THREE.Object3D
  vel: THREE.Vector3
  life: number
  age: number
  spin?: THREE.Vector3
  gravity: number
  fade?: THREE.Material
  /** Ages in real seconds instead of scene time (speech bubbles). */
  wall?: boolean
}

interface Wanderer {
  obj: THREE.Group
  until: number
  target: P
}

/** One parcel of new tasks, from the courier's van to the Boss's hands. */
interface Delivery {
  items: { folder: Folder, errand: Errand, placed: () => void }[]
  /** Set when the courier reaches the Boss: later arrivals go into the next parcel. */
  sealed: boolean
  ready: Promise<void>
  bossReady: () => void
  handed: Promise<void>
  handedOver: () => void
}

const COURIER = 'courier'
/** The reviewers' cubicle signs, after Pia's "PIA · PROJECT MANAGER". */
const REVIEWER_TITLES: Partial<Record<OfficePerson['role'], string>> = {
  ux: 'UX TESTER',
  cq: 'CODE REVIEWER',
  qa: 'QUALITY ASSURANCE'
}
/** The golf ball's height resting on the green. */
const BALL_Y = 0.095
/** Seconds into the putt gesture (1.1 s) when the putter head meets the ball. */
const PUTT_STRIKE = 0.8
/** Small talk by the coffee machine: opener, reply and sometimes a parting line from the first speaker. */
const CHATS: [string, string, string?][] = [
  ['did you see the board?', 'which one 😅', 'all of them'],
  ['tabs or spaces?', 'tabs. obviously.'],
  ['ship it?', 'ship it.', '🚀'],
  ['nice weekend?', 'debugged all of it', '😬'],
  ['who broke staging?', '👀'],
  ['coffee\'s cold again', 'blame QA', 'I heard that'],
  ['standup at 10?', 'standup is a lie'],
  ['lunch?', 'pizza 🍕', 'deal']
]

const ROLE_NAMES: Record<OfficePerson['role'], string> = {
  pm: 'project manager',
  worker: 'worker',
  ux: 'usability tester',
  cq: 'code reviewer',
  qa: 'QA',
  boss: 'the Boss'
}

const ACTIVITY_NAMES: Record<string, string> = {
  'working': 'hard at work',
  'eyeing-todo': 'eyeing the todo tray',
  'reviewing': 'reviewing',
  'triaging': 'checking handed-in work',
  'sorting': 'sorting the backlog'
}

const IDLE_NAMES: Record<IdleStyle, string> = {
  doze: 'dozing at the desk',
  phone: 'scrolling the phone',
  game: 'gaming on the work PC'
}

/** A spot `gap` short of `target`, on the side `from` stands. */
function shortOf(target: { x: number, z: number }, from: { x: number, z: number }, gap: number): P {
  const dx = from.x - target.x
  const dz = from.z - target.z
  const length = Math.hypot(dx, dz) || 1
  return { x: target.x + (dx / length) * gap, z: target.z + (dz / length) * gap }
}

export class OfficeScene {
  speed = 1
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private room: Room
  private fixtures: Fixtures
  /** Not one of the cast: walks in from the street with each parcel of new tasks. */
  private courier: Actor | null = null
  /** The parcel still open for more folders: until the courier reaches the Boss, new arrivals ride along. */
  private delivery: Delivery | null = null
  private layout: Layout | null = null
  private actors = new Map<string, Actor>()
  private desks = new Map<string, DeskParts>()
  private deskGroup = new THREE.Group()
  private folders = new Map<string, Folder>()
  private folderChains = new Map<string, Promise<void>>()
  private floaters: Floater[] = []
  private wanderers: Wanderer[] = []
  private timers: { at: number, done: () => void }[] = []
  private snapshot: OfficeSnapshot | null = null
  private cast: OfficePerson[] = []
  private castKey = ''
  private time = 0
  private last = 0
  private frame = 0
  private orderSerial = 0
  private errandsOpen = 0
  /** Bumped on every rebuild, so errands still finishing from the old floor do not touch the new count. */
  private floor = 0
  private screenTick = 0
  private rocketLaunch = -100
  private sirenBoost = -100
  private bugFreeSince = Date.now()
  private pongOn = false
  private golfBall: THREE.Mesh | null = null
  private shake = new Map<string, number>()
  private raycaster = new THREE.Raycaster()
  private pointer: { x: number, y: number } | null = null
  private resize: ResizeObserver
  private disposed = false
  private hooks: OfficeHooks
  private container: HTMLElement

  constructor(container: HTMLElement, hooks: OfficeHooks = {}) {
    this.container = container
    this.hooks = hooks
    this.renderer = hooks.renderer?.() ?? new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(this.renderer.domElement)

    this.scene.background = new THREE.Color('#1e2235')
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.5, 300)
    this.camera.position.set(6, 28, 31)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 0, -1)
    this.controls.enableDamping = true
    this.controls.maxPolarAngle = 1.3
    this.controls.minDistance = 8
    this.controls.maxDistance = 80

    this.scene.add(new THREE.HemisphereLight('#fff8ee', '#5a5f73', 1.25))
    const sun = new THREE.DirectionalLight('#fff2dc', 2.2)
    sun.position.set(-14, 28, 16)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const s = sun.shadow.camera
    s.left = -26
    s.right = 26
    s.top = 22
    s.bottom = -22
    s.far = 90
    sun.shadow.bias = -0.0006
    this.scene.add(sun)

    this.room = buildRoom()
    this.scene.add(this.room.group)
    this.fixtures = buildFixtures()
    this.scene.add(this.fixtures.group)
    this.scene.add(this.deskGroup)

    this.resize = new ResizeObserver(() => this.fit())
    this.resize.observe(container)
    this.fit()
    this.renderer.domElement.addEventListener('pointermove', this.onPointer)
    this.renderer.domElement.addEventListener('pointerleave', this.onLeave)
    this.last = performance.now()
    this.frame = requestAnimationFrame(this.tick)
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.resize.disconnect()
    this.renderer.domElement.removeEventListener('pointermove', this.onPointer)
    this.renderer.domElement.removeEventListener('pointerleave', this.onLeave)
    this.controls.dispose()
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      mesh.geometry?.dispose()
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined
      for (const m of Array.isArray(material) ? material : material ? [material] : []) {
        (m as THREE.MeshStandardMaterial).map?.dispose()
        m.dispose()
      }
    })
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  /** Forget the board: the next snapshot rebuilds the floor instead of playing errands from the old one. */
  reset() {
    this.castKey = ''
    this.snapshot = null
  }

  /**
   * How many errands from the board are still waiting to be played or are under way. Pastimes (coffee,
   * ping-pong, golf, rounds) do not count: they never hold the board up.
   */
  get backlog(): number {
    return this.errandsOpen
  }

  /** Counts one errand as open; the returned function closes it, once, and only for the floor it began on. */
  private openErrand(): () => void {
    const floor = this.floor
    let open = true
    this.errandsOpen++
    return () => {
      if (open && floor === this.floor) this.errandsOpen--
      open = false
    }
  }

  // ── Board in ───────────────────────────────────────────────────────────────

  /** Each desk's light follows the status in the snapshot, live: no rebuild of the floor. */
  private syncStatuses() {
    for (const person of this.cast) this.actors.get(person.key)?.setStatus(person.status)
  }

  setSnapshot(next: OfficeSnapshot) {
    const cast = castWithStandIns(next.cast)
    const castKey = cast.map(p => `${p.key}:${p.role}`).join(',')
    const prev = this.snapshot
    this.snapshot = next
    if (castKey !== this.castKey) {
      // New people (or the first look): rebuild the floor and put every folder where it belongs.
      this.castKey = castKey
      this.cast = cast
      this.rebuild(next)
      this.drawWhiteboard()
      return
    }
    this.cast = cast
    this.syncStatuses()
    for (const errand of errandsBetween(prev, next)) this.run(errand)
    for (const ping of pingsBetween(prev, next)) {
      const folder = this.folders.get(ping.taskId)
      const owner = ownerOf(ping.place)
      const actor = owner ? this.actors.get(owner) : undefined
      const at = actor && !actor.away ? this.headOf(actor) : folder ? folder.obj.getWorldPosition(new THREE.Vector3()) : null
      if (at) this.bubble(ping.kind === 'comment' ? '💬' : '✔️', at)
    }
    for (const task of next.tasks) {
      const folder = this.folders.get(task.id)
      if (folder) {
        folder.title = task.title
        folder.column = task.column
      }
    }
    this.drawWhiteboard()
  }

  private rebuild(snap: OfficeSnapshot) {
    for (const actor of this.actors.values()) this.scene.remove(actor.rig.root)
    for (const folder of this.folders.values()) folder.obj.removeFromParent()
    this.actors.clear()
    this.folders.clear()
    this.folderChains.clear()
    this.floor++
    this.errandsOpen = 0
    this.desks.clear()
    this.deskGroup.clear()

    const layout = buildLayout(this.cast)
    this.layout = layout
    // A role's desk is its seat node on the floor: the role pieces name a person key and get the point from here.
    routes.setDeskLookup(personKey => layout.graph.nodes.get(layout.seatNode(personKey)) ?? null)
    for (const person of this.cast) {
      const desk = layout.desks.get(person.key)
      if (!desk) continue
      const first = person.name.split(/\s+/)[0]?.toUpperCase() ?? person.key
      let parts: DeskParts
      const flair = flairOf(person.key)
      if (desk.kind === 'pm') parts = buildPiaDesk(desk, flair)
      else if (desk.kind === 'boss') parts = buildBossOffice(desk, flair, first)
      else {
        const title = REVIEWER_TITLES[person.role]
        const sign = title ? { text: `${first} · ${title}`, color: lookOf(person.key).shirt } : undefined
        parts = buildCubicle(desk, first, person.role === 'worker' ? 'TODO' : `VERIFY ${person.role.toUpperCase()}`, sign, flair)
      }
      this.deskGroup.add(parts.group)
      this.desks.set(person.key, parts)
      if (parts.golfBall) this.golfBall = parts.golfBall
      if (person.key === 'wynn' || (person.role === 'worker' && person.key.startsWith('u-'))) this.addDuck(desk.work)

      const actor = new Actor(person, desk.seat, desk.facing)
      // The chair turns with whoever sits in it: swivels and spins move both.
      actor.chair = parts.chair
      actor.onBeat = (beat, who) => this.onBeat(beat, who)
      this.actors.set(person.key, actor)
      this.scene.add(actor.rig.root)
    }

    // The courier waits out in the street, out of sight, until the real board sends something.
    if (this.courier) this.scene.remove(this.courier.rig.root)
    const street = layout.graph.nodes.get('street')!
    const courier = new Actor({ userId: '', key: COURIER, name: 'Courier', role: 'worker' }, street, -Math.PI / 2)
    courier.speed = 1.4
    courier.rig.root.visible = false
    this.courier = courier
    this.delivery = null
    this.scene.add(courier.rig.root)

    for (const task of snap.tasks) {
      const folder = this.makeFolder(task.id, task.title, task.column)
      this.putDown(folder, placeOf(task, this.cast))
    }
    this.refreshActivities()
  }

  private addDuck(at: P3) {
    const duck = new THREE.Group()
    const yellow = new THREE.MeshStandardMaterial({ color: '#ffd60a', roughness: 0.4 })
    const bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), yellow)
    bodyMesh.scale.set(1.2, 0.9, 1)
    duck.add(bodyMesh)
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), yellow)
    headMesh.position.set(0.08, 0.13, 0)
    duck.add(headMesh)
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 8), new THREE.MeshStandardMaterial({ color: '#f77f00' }))
    beak.position.set(0.17, 0.12, 0)
    beak.rotation.z = -Math.PI / 2
    duck.add(beak)
    duck.position.set(at.x + 0.5, at.y + 0.1, at.z - 0.25)
    this.deskGroup.add(duck)
  }

  // ── Folders ────────────────────────────────────────────────────────────────

  private makeFolder(id: string, title: string, column: string): Folder {
    const folder: Folder = { id, title, column, obj: buildFolder(id), place: null, order: 0 }
    this.folders.set(id, folder)
    return folder
  }

  private putDown(folder: Folder, place: Place) {
    folder.place = place
    folder.order = ++this.orderSerial
    this.scene.add(folder.obj)
    this.restack(place)
  }

  private pickUp(folder: Folder) {
    const was = folder.place
    folder.place = null
    if (was) this.restack(was)
  }

  private restack(place: Place) {
    if (!this.layout) return
    const here = [...this.folders.values()].filter(f => f.place === place).sort((a, b) => a.order - b.order)
    here.forEach((folder, i) => {
      const p = this.layout!.folderAt(place, i)
      folder.obj.position.set(p.x, p.y, p.z)
      folder.obj.rotation.set(0, ((folder.order * 37) % 11 - 5) * 0.03, 0)
      if (place === SHELF) folder.obj.rotation.set(0, Math.PI / 2, Math.PI / 2.3)
      if (place === JAR) folder.obj.scale.setScalar(0.45)
      else folder.obj.scale.setScalar(1)
    })
  }

  private placePoint(place: Place): P {
    if (!this.layout) return { x: 0, z: 0 }
    const p = this.layout.folderAt(place, 0)
    return { x: p.x, z: p.z }
  }

  // ── Errands ────────────────────────────────────────────────────────────────

  private run(errand: Errand) {
    if (errand.kind === 'arrive') return this.deliver(errand)
    const before = this.folderChains.get(errand.taskId) ?? Promise.resolve()
    const settle = this.openErrand()
    const next = before.then(() => this.perform(errand)).finally(settle)
    this.folderChains.set(errand.taskId, next)
  }

  private wait(seconds: number): Promise<void> {
    return new Promise((resolve) => {
      this.timers.push({ at: this.time + seconds, done: resolve })
    })
  }

  private async goTo(actor: Actor, node: string) {
    const layout = this.layout!
    const target = layout.graph.nodes.get(node)
    if (!target) return
    const from = layout.graph.nearest({ x: actor.position.x, z: actor.position.z })
    const route = layout.graph.path(from, node)
    if (!route.length) route.push(target)
    // Standing well off the paths (after chasing a ball, say), the nearest node can lie the wrong way. Do not
    // walk to it just to turn round when the next one is no further from where you stand than it is itself.
    const off = (p: P) => Math.hypot(actor.position.x - p.x, actor.position.z - p.z)
    while (route.length > 1 && off(route[0]!) > 0.5 && off(route[1]!) <= Math.hypot(route[0]!.x - route[1]!.x, route[0]!.z - route[1]!.z)) route.shift()
    // Off the paths, do not take a first node that sends you one way only to turn back on yourself at once:
    // the body would snap round. Skip it. (Nodes along a path are left alone: a turn there goes round a desk.)
    const legs: P[] = [{ x: actor.position.x, z: actor.position.z }, ...route]
    const turnAt = (i: number) => {
      const ax = legs[i]!.x - legs[i - 1]!.x
      const az = legs[i]!.z - legs[i - 1]!.z
      const bx = legs[i + 1]!.x - legs[i]!.x
      const bz = legs[i + 1]!.z - legs[i]!.z
      return (ax * bx + az * bz) / ((Math.hypot(ax, az) * Math.hypot(bx, bz)) || 1)
    }
    while (legs.length > 2 && off(route[0]!) > 0.5 && turnAt(1) < -0.4) legs.splice(1, 1)
    // A sharp corner on the path (the graph turns back at a node, such as round a table) is cut, so the body does not
    // snap round at the node in one stride.
    await actor.walk(roundSharpCorners(legs).slice(1))
  }

  private async goHome(actor: Actor) {
    await this.goTo(actor, this.layout!.seatNode(actor.key))
    actor.sitDown()
    this.refreshActivities()
  }

  private perform(errand: Errand): Promise<void> {
    if (!this.layout) return Promise.resolve()
    const folder = this.folders.get(errand.taskId)
    if (!folder) return Promise.resolve()
    const actor = (errand.courier ? this.actors.get(errand.courier) : undefined) ?? this.actors.get(this.layout.pia)
    if (!actor) {
      this.pickUp(folder)
      if (errand.to !== SHREDDER) this.putDown(folder, errand.to)
      return Promise.resolve()
    }
    return actor.enqueue(() => this.trip(actor, folder, errand))
  }

  private async trip(actor: Actor, folder: Folder, errand: Errand) {
    const layout = this.layout!
    this.ticker(errand)
    this.refreshActivities()

    // To the folder.
    await this.goTo(actor, layout.approach(errand.from, actor.key))
    actor.faceToward(this.placePoint(errand.from))
    if (errand.kind === 'reject') {
      this.bubble('😤', this.headOf(actor))
      await actor.play('stomp')
    } else if (errand.kind === 'reopen') {
      this.bubble('😮‍💨', this.headOf(actor))
    }
    await actor.play('reach')
    this.pickUp(folder)
    actor.hold(folder.obj)
    this.bubble(this.pickUpBubble(errand), this.headOf(actor))
    this.refreshActivities()

    // To where it goes.
    await this.goTo(actor, layout.approach(errand.to, actor.key))
    const owner = ownerOf(errand.to)
    const ownerActor = owner && owner !== actor.key ? this.actors.get(owner) : undefined
    if (ownerActor && !ownerActor.away && !ownerActor.busy && ownerActor.dozing) {
      actor.faceToward({ x: ownerActor.position.x, z: ownerActor.position.z })
      this.bubble('knock knock!', this.headOf(actor), 0.38)
      await actor.play('knock')
      this.bubble('❗', this.headOf(ownerActor))
      void ownerActor.play('startle')
      await this.wait(0.4)
    } else if (ownerActor && !ownerActor.away && !ownerActor.busy && ownerActor.activity === 'idle') {
      // Caught on the phone or mid-game.
      actor.faceToward({ x: ownerActor.position.x, z: ownerActor.position.z })
      this.bubble('ahem.', this.headOf(actor), 0.36)
      await this.wait(0.5)
      this.bubble(ownerActor.idleStyle === 'game' ? 'one sec, boss fight!' : '🙈 was just checking…', this.headOf(ownerActor), 0.32)
      void ownerActor.play('startle')
      await this.wait(0.5)
    }
    actor.faceToward(errand.to === SHREDDER ? FIXTURES.shredder : this.placePoint(errand.to))
    await actor.play('reach')
    actor.hold(null)
    if (errand.to === SHREDDER) {
      await this.shred(folder)
    } else {
      this.putDown(folder, errand.to)
    }
    this.refreshActivities()
    await this.afterDrop(actor, errand, ownerActor)
    await this.goHome(actor)
  }

  private pickUpBubble(errand: Errand): string {
    switch (errand.kind) {
      case 'assign': return '📋'
      case 'start': return '💪'
      case 'hand-in': return '✅'
      case 'pass-on': return '👉'
      case 'reject': return '↩️'
      case 'block': return '😩'
      case 'unblock': return '🦸'
      case 'bug': return '🐛'
      case 'ship': return '🚀'
      case 'done': return '🥳'
      case 'delete': return '🗑️'
      case 'reassign': return '🔀'
      default: return '📁'
    }
  }

  private async afterDrop(actor: Actor, errand: Errand, owner: Actor | undefined) {
    const reacting = owner && !owner.away && !owner.busy ? owner : undefined
    switch (errand.kind) {
      case 'assign':
        if (reacting) {
          this.bubble('👍', this.headOf(reacting))
          void reacting.play('wave')
        }
        break
      case 'hand-in':
        if (reacting) this.bubble('👀', this.headOf(reacting))
        break
      case 'pass-on':
        if (reacting) this.bubble('🧐', this.headOf(reacting))
        break
      case 'reject':
        if (reacting) {
          this.bubble('🤦', this.headOf(reacting))
          void reacting.play('facepalm')
        }
        break
      case 'block':
        this.sirenBoost = this.time
        this.bubble('🚨', { x: FIXTURES.shelf.x, y: 3.9, z: FIXTURES.shelf.z })
        await actor.play('scratch')
        break
      case 'unblock':
        await actor.play('cheer')
        break
      case 'bug':
        this.bugFreeSince = Date.now()
        this.releaseBug()
        this.bubble('🐛💨', this.headOf(actor))
        await actor.play('startle')
        this.drawWhiteboard()
        break
      case 'ship':
        this.rocketLaunch = this.time
        await actor.play('cheer')
        break
      case 'done': {
        const at = { x: FIXTURES.archive.x, y: 2.4, z: FIXTURES.archive.z }
        this.confetti(at)
        await actor.play('cheer')
        for (const other of this.actors.values()) {
          if (other !== actor && !other.away && !other.busy && !other.dozing && Math.random() < 0.6) {
            this.bubble('🎉', this.headOf(other))
            void other.play('cheer')
          }
        }
        break
      }
      case 'reassign': {
        const from = ownerOf(errand.from)
        const was = from ? this.actors.get(from) : undefined
        if (was && !was.away && !was.busy) {
          this.bubble('🤷', this.headOf(was))
          void was.play('shrug')
        }
        break
      }
      default:
        break
    }
  }

  // ── Deliveries ─────────────────────────────────────────────────────────────

  /**
   * A new task from the real board goes into the parcel the courier is bringing. Everything that arrives
   * before the courier reaches the Boss rides along in the same box; after that, a new parcel starts.
   */
  private deliver(errand: Errand) {
    if (!this.layout || this.folders.has(errand.taskId)) return
    const task = this.snapshot?.tasks.find(t => t.id === errand.taskId)
    const folder = this.makeFolder(errand.taskId, errand.title, task?.column ?? '')
    const boss = this.actors.get(this.layout.boss)
    if (!this.courier || !boss) {
      this.putDown(folder, errand.to)
      this.ticker(errand)
      return
    }
    let placed: () => void = () => {}
    const settle = this.openErrand()
    this.folderChains.set(errand.taskId, new Promise<void>((resolve) => {
      placed = () => {
        settle()
        resolve()
      }
    }))
    let delivery = this.delivery
    if (!delivery || delivery.sealed) {
      const fresh: Delivery = { items: [], sealed: false, bossReady: () => {}, handedOver: () => {}, ready: null!, handed: null! }
      fresh.ready = new Promise<void>((resolve) => {
        fresh.bossReady = resolve
      })
      fresh.handed = new Promise<void>((resolve) => {
        fresh.handedOver = resolve
      })
      delivery = fresh
      this.delivery = fresh
      const courier = this.courier
      void courier.enqueue(() => this.bringParcel(courier, boss, fresh))
      void boss.enqueue(() => this.unpack(boss, fresh))
    }
    delivery.items.push({ folder, errand, placed })
  }

  private async bringParcel(courier: Actor, boss: Actor, delivery: Delivery) {
    const parcel = buildParcel()
    courier.rig.root.visible = true
    courier.hold(parcel)
    await this.goTo(courier, 'boss:visitor')
    delivery.sealed = true
    if (this.delivery === delivery) this.delivery = null
    const n = delivery.items.length
    courier.faceToward({ x: boss.position.x, z: boss.position.z })
    this.bubble(`📦 delivery for the Boss! ${n} folder${n === 1 ? '' : 's'}`, this.headOf(courier), 0.34)
    await delivery.ready
    courier.faceToward({ x: boss.position.x, z: boss.position.z })
    await courier.play('reach')
    courier.hold(null)
    boss.hold(parcel)
    delivery.handedOver()
    this.bubble('✍️', this.headOf(boss))
    await this.wait(0.5)
    await this.goTo(courier, 'street')
    // Another parcel already waiting? Then stay in sight and bring it straight in.
    if (courier.queued <= 1) courier.rig.root.visible = false
  }

  /** The Boss meets the courier, cuts the box open and walks the folders to wherever the board filed them. */
  private async unpack(boss: Actor, delivery: Delivery) {
    const layout = this.layout!
    await this.goTo(boss, 'boss:sign')
    boss.faceToward(layout.graph.nodes.get('boss:visitor')!)
    delivery.bossReady()
    await delivery.handed
    this.bubble('✂️', this.headOf(boss))
    await boss.play('scratch', 0.8)
    const box = boss.carrying
    const at = box ? box.getWorldPosition(new THREE.Vector3()) : this.headOf(boss)
    this.puff({ x: at.x, y: at.y + 0.4, z: at.z }, '#fefae0', 18)
    boss.hold(null)
    box?.removeFromParent()

    // An armful of folders, stacked; each is set down where the board put it.
    const items = delivery.items
    const armful = new THREE.Group()
    const restackArmful = () => {
      items.filter(item => item.folder.obj.parent === armful).forEach((item, i) => {
        item.folder.obj.position.set(0, i * 0.07, 0)
        item.folder.obj.rotation.set(0, (i % 2) * 0.12, 0)
        item.folder.obj.scale.setScalar(1)
      })
    }
    for (const item of items) armful.add(item.folder.obj)
    restackArmful()
    boss.hold(armful)
    const n = items.length
    this.bubble(n > 3 ? `${n} new tasks! 📂` : '📂', this.headOf(boss), 0.34)
    this.refreshActivities()

    // Pia's backlog first, then any other spot the board chose, in the order they came.
    const stops = [...new Set(items.map(item => item.errand.to))]
      .sort((a, b) => Number(ownerOf(b) === layout.pia) - Number(ownerOf(a) === layout.pia))
    for (const to of stops) {
      const here = items.filter(item => item.errand.to === to)
      await this.goTo(boss, layout.approach(to, boss.key))
      boss.faceToward(this.placePoint(to))
      await boss.play('reach')
      for (const item of here) {
        this.putDown(item.folder, to)
        this.ticker(item.errand)
        item.placed()
      }
      restackArmful()
      this.refreshActivities()
      const owner = ownerOf(to)
      const ownerActor = owner && owner !== boss.key ? this.actors.get(owner) : undefined
      if (ownerActor && !ownerActor.away && !ownerActor.busy) {
        const many = here.length > 2
        this.bubble(many ? '😱 all of these?' : owner === layout.pia ? '📥 thanks boss' : '👍', this.headOf(ownerActor), 0.32)
        if (many) void ownerActor.play('facepalm')
        else void ownerActor.play('wave')
      }
    }
    boss.hold(null)
    await this.goHome(boss)
  }

  private async shred(folder: Folder) {
    const mouth = this.fixtures.shredderMouth
    this.scene.add(folder.obj)
    folder.obj.position.set(mouth.x, mouth.y + 0.6, mouth.z)
    folder.obj.rotation.set(Math.PI / 2, 0, 0)
    const start = this.time
    while (this.time - start < 0.8) {
      const k = (this.time - start) / 0.8
      folder.obj.position.y = mouth.y + 0.6 - k * 0.7
      folder.obj.scale.set(1, 1, 1 - k)
      if (Math.random() < 0.6) this.strip(mouth)
      await this.wait(0)
    }
    folder.obj.removeFromParent()
    this.folders.delete(folder.id)
    this.folderChains.delete(folder.id)
  }

  // ── Activities and beats ───────────────────────────────────────────────────

  private refreshActivities() {
    const places = [...this.folders.values()].map(f => f.place).filter((p): p is Place => Boolean(p))
    for (const actor of this.actors.values()) actor.activity = activityOf(actor.person, places)
  }

  private onBeat(beat: Beat, actor: Actor) {
    if (actor.away) return
    const head = this.headOf(actor)
    switch (beat) {
      case 'zzz':
        this.bubble(Math.random() < 0.85 ? 'z' : 'Zzz', { x: head.x + 0.3, y: head.y - 0.4, z: head.z }, 0.34, '#ffffffcc', true)
        break
      case 'bonk': {
        const desk = this.layout?.desks.get(actor.key)
        if (desk) this.sparks({ x: desk.center.x, y: 0.9, z: (desk.center.z + desk.seat.z) / 2 })
        this.shake.set(actor.key, this.time)
        if (Math.random() < 0.3) this.bubble(Math.random() < 0.5 ? 'BONK!' : 'CLANG!', head, 0.4)
        break
      }
      case 'keys':
        this.keys(actor)
        if (Math.random() < 0.08) this.bubble('⌨️🔥', head)
        break
      case 'duck':
        this.bubble(Math.random() < 0.5 ? '🦆?' : '💡', head)
        break
      case 'sip':
        this.bubble('☕', head)
        break
      case 'clank':
        if (Math.random() < 0.4) this.bubble('🔧', head)
        this.sparks({ x: actor.position.x, y: 1.0, z: actor.position.z + (actor.facing === 0 ? 0.8 : -0.8) }, 4)
        break
      case 'spin':
        this.bubble('wheee', head, 0.36)
        break
      case 'scribble':
        if (Math.random() < 0.5) this.bubble(['nit:', '✍️', '🤨', 'why?'][Math.floor(Math.random() * 4)]!, head, 0.36)
        break
      case 'stamp':
        this.bubble(Math.random() < 0.7 ? '✅' : '❌', head)
        break
      case 'peer':
        if (Math.random() < 0.5) this.bubble(actor.person.role === 'pm' ? '🔎' : '🤔', head)
        break
      case 'read':
        this.bubble(['🧐', '📈', '💰'][Math.floor(Math.random() * 3)]!, head)
        break
      case 'shuffle':
        if (Math.random() < 0.4) this.bubble('📂', head)
        break
      case 'eye':
        this.bubble(['👀', '😬', '🫣'][Math.floor(Math.random() * 3)]!, head)
        break
      case 'scroll':
        this.bubble(['📱', '😂', '🐱', '👍', '🔥', 'lol'][Math.floor(Math.random() * 6)]!, head, 0.4)
        break
      case 'pew':
        this.bubble(['pew pew', 'HEADSHOT!', 'gg ez', 'lag!!', '😤', 'camping…'][Math.floor(Math.random() * 6)]!, head, 0.36)
        this.shake.set(actor.key, this.time)
        break
      default:
        break
    }
  }

  /**
   * Now and then someone with nothing on their desk gets up for coffee or a cup of water, sometimes with a
   * colleague in tow for a chat by the machine. Only when no errand is waiting anywhere; ping-pong
   * (maybePong) and the Boss (maybeBoss) keep their own pace.
   */
  private maybeWander(dt: number) {
    if (!this.layout || this.backlog > 0) return
    for (const actor of this.actors.values()) {
      if (!this.canTakeBreak(actor)) continue
      if (Math.random() > dt / (actor.activity === 'idle' ? 45 : 90)) continue
      const buddies = [...this.actors.values()].filter(other => other !== actor && this.canTakeBreak(other))
      const buddy = Math.random() < 0.5 ? buddies[Math.floor(Math.random() * buddies.length)] : undefined
      this.takeBreak(actor, Math.random() < 0.55 ? 'coffee' : 'cooler', buddy)
      return
    }
  }

  private canTakeBreak(actor: Actor): boolean {
    return actor.person.role !== 'boss' && !actor.busy && !actor.away && actor.activity !== 'working'
  }

  /**
   * One trip to the coffee machine or the cooler: pour, carry the drink back, drink it at the desk. With a
   * buddy, the buddy stands by for a few lines of small talk and pours their own once the first one leaves.
   * Work arriving cuts the chat short.
   */
  private takeBreak(actor: Actor, at: 'coffee' | 'cooler', buddy?: Actor) {
    const drink = at === 'coffee' ? 'mug' : 'cup'
    const icon = at === 'coffee' ? '☕' : '💧'
    let arrived = () => {}
    const buddyThere = new Promise<void>((resolve) => {
      arrived = resolve
    })
    let over = () => {}
    const chatOver = new Promise<void>((resolve) => {
      over = resolve
    })
    const pour = async (who: Actor) => {
      await this.goTo(who, `${at}:spot`)
      who.face(-Math.PI / 2)
      await who.play('reach')
      who.tool = drink
      this.bubble(icon, this.headOf(who), 0.3)
    }
    const drinkAtDesk = async (who: Actor) => {
      await this.goHome(who)
      await who.play('drink')
      who.tool = null
    }

    void actor.enqueue(async () => {
      try {
        await pour(actor)
        if (buddy) {
          await Promise.race([buddyThere, this.wait(8)])
          if (this.near(buddy, `${at}:chat`)) await this.chat(actor, buddy)
        }
      } finally {
        over()
      }
      await drinkAtDesk(actor)
    })
    if (!buddy) return
    void buddy.enqueue(async () => {
      await this.goTo(buddy, `${at}:chat`)
      buddy.faceToward(actor.position)
      arrived()
      await Promise.race([chatOver, this.wait(30)])
      await pour(buddy)
      await drinkAtDesk(buddy)
    })
  }

  private near(actor: Actor, node: string): boolean {
    const p = this.layout?.graph.nodes.get(node)
    return Boolean(p) && Math.hypot(actor.position.x - p!.x, actor.position.z - p!.z) < 0.4
  }

  /** Two or three lines each way, broken off as soon as an errand turns up for either of them. */
  private async chat(a: Actor, b: Actor) {
    const [opener, reply, closer] = CHATS[Math.floor(Math.random() * CHATS.length)]!
    a.faceToward(b.position)
    b.faceToward(a.position)
    const lines: [Actor, string][] = [[a, opener], [b, reply]]
    if (closer) lines.push([a, closer])
    for (const [who, line] of lines) {
      if (this.backlog > 0 || a.queued > 1 || b.queued > 1) {
        this.bubble('gotta go!', this.headOf(who), 0.3)
        await this.wait(0.6)
        return
      }
      this.bubble(line, this.headOf(who), 0.3)
      void who.play('wave', 0.6)
      await this.wait(2.2)
    }
  }

  /**
   * A Boss with nothing to read does not sit still for long: every ten seconds or so he gets up to putt
   * on the green or to make the rounds. Only his own queue holds him back, not the rest of the office's.
   */
  private maybeBoss(dt: number) {
    const boss = this.layout ? this.actors.get(this.layout.boss) : undefined
    if (!boss || boss.busy || boss.away || boss.activity !== 'idle') return
    if (Math.random() > dt / 10) return
    void boss.enqueue(() => Math.random() < 0.5 ? this.golf(boss) : this.makeRounds(boss))
  }

  /**
   * Putting practice. The Boss putts from the tee; the ball drops or stops short, he walks over, fishes it
   * out and putts again, for as long as nothing else is waiting for him (and at most a dozen times).
   */
  private async golf(boss: Actor) {
    const ball = this.golfBall
    await this.goTo(boss, 'boss:green')
    if (!ball) return this.goHome(boss)
    const say = (line: string) => this.bubble(line, this.headOf(boss), 0.34)
    const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)]!
    const free = () => boss.queued <= 1 && boss.activity === 'idle'
    boss.tool = 'putter'
    say('⛳')
    for (let putt = 0; putt < 12; putt++) {
      await boss.walk([GOLF.stand])
      // Side-on to the hole, looking down at the ball, both hands on the club.
      boss.face(0)
      boss.stance = 'putt'
      ball.position.set(GOLF.tee.x, BALL_Y, GOLF.tee.z)
      ball.visible = true
      await this.wait(0.5)
      const swing = boss.play('putt')
      await this.wait(PUTT_STRIKE)
      const sinks = Math.random() < 0.5
      const stop = sinks
        ? GOLF.hole
        : { x: GOLF.hole.x - 0.25 - Math.random() * 0.7, z: GOLF.hole.z + (Math.random() - 0.5) * 0.5 }
      await this.roll(ball, GOLF.tee, stop, sinks ? 1.2 : 1.0)
      await swing
      boss.stance = null
      if (sinks) {
        ball.visible = false
        say(putt === 0 ? 'hole in one!' : pick(['in! ⛳', 'still got it', 'FORE! …wait']))
        void boss.play('cheer')
      } else {
        say(pick(['so close', '🙄', 'the green is crooked']))
      }
      await this.wait(0.8)
      if (!free()) break
      // Over to the ball: fish it out of the hole or pick it up where it stopped.
      await boss.walk([{ x: stop.x - 0.5, z: stop.z }])
      boss.face(Math.PI / 2)
      await boss.play('reach')
      ball.visible = false
      await this.wait(0.2)
      if (!free()) break
    }
    ball.position.set(GOLF.tee.x, BALL_Y, GOLF.tee.z)
    ball.visible = true
    boss.tool = null
    boss.stance = null
    await this.goHome(boss)
  }

  /** Rolls the golf ball from `from` to `to`, slowing as it goes, spinning as it rolls. */
  private async roll(ball: THREE.Object3D, from: P, to: P, seconds: number) {
    const start = this.time
    while (this.time - start < seconds) {
      const k = (this.time - start) / seconds
      const eased = 1 - (1 - k) * (1 - k)
      ball.position.set(from.x + (to.x - from.x) * eased, BALL_Y, from.z + (to.z - from.z) * eased)
      ball.rotation.z = -eased * 20
      await this.wait(0)
    }
    ball.position.set(to.x, BALL_Y, to.z)
  }

  /** The Boss walks past two or three desks and has a word with whoever is there, in whatever state he finds them. */
  private async makeRounds(boss: Actor) {
    const layout = this.layout!
    const others = [...this.actors.values()].filter(a => a !== boss && !a.away && !a.busy)
    const visits = others.sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 2))
    if (!visits.length) return this.golf(boss)
    this.bubble('making the rounds 🚶', this.headOf(boss), 0.32)
    for (const who of visits) {
      const node = who.key === layout.pia ? 'pia:right' : `tray:${who.key}`
      if (!layout.graph.nodes.has(node)) continue
      await this.goTo(boss, node)
      boss.faceToward({ x: who.position.x, z: who.position.z })
      await this.wait(0.3)
      const say = (line: string, actor: Actor) => this.bubble(line, this.headOf(actor), 0.32)
      const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)]!
      if (who.away || who.busy) {
        say('🤔 where did they go?', boss)
      } else if (who.activity === 'working') {
        say(pick(['how\'s it going?', 'looking good 👍', 'need anything?', 'ETA?']), boss)
        await this.wait(0.8)
        say(pick(['on it!', 'almost there', '😅', 'nearly done, boss']), who)
      } else if (who.dozing) {
        say('AHEM!', boss)
        await boss.play('knock')
        say('❗', who)
        await who.play('startle')
        say(pick(['I was thinking!', 'just resting my eyes…']), who)
      } else if (who.activity === 'idle' && who.idleStyle === 'game') {
        say('📸 …really?', boss)
        await this.wait(0.6)
        void who.play('startle')
        say(pick(['it\'s research!', 'testing the GPU!']), who)
      } else if (who.activity === 'idle') {
        say('👀', boss)
        await this.wait(0.6)
        void who.play('startle')
        say('🙈 checking the board, honest', who)
      } else {
        say(pick(['carry on', 'good, good', '👍']), boss)
        await this.wait(0.6)
        say('🫡', who)
      }
      await this.wait(1.0)
    }
    await this.goHome(boss)
  }

  /**
   * Two idle people (never the Boss) walk to the ping-pong table and play until one of them gets
   * work or the match runs its course. Returns whether a match started.
   */
  private maybePong(dt: number, force = false): boolean {
    if (this.pongOn) return false
    const free = [...this.actors.values()].filter(a => !a.busy && !a.away && a.activity === 'idle' && a.person.role !== 'boss')
    if (free.length < 2 || (!force && Math.random() > dt / 12)) return false
    const a = free.splice(Math.floor(Math.random() * free.length), 1)[0]!
    const b = free[Math.floor(Math.random() * free.length)]!
    this.pongOn = true
    let arrived = 0
    let release: () => void = () => {}
    const both = new Promise<void>((resolve) => {
      release = resolve
    })
    const game = both.then(() => this.rally(a, b)).finally(() => {
      this.pongOn = false
    })
    const ends: [Actor, string, number][] = [[a, 'pong:w', Math.PI / 2], [b, 'pong:e', -Math.PI / 2]]
    for (const [player, node, facing] of ends) {
      void player.enqueue(async () => {
        this.bubble(player === a ? 'ping-pong?' : 'you\'re on!', this.headOf(player), 0.34)
        await this.goTo(player, node)
        player.face(facing)
        player.playing = true
        if (++arrived === 2) release()
        await game
        player.playing = false
        await this.goHome(player)
      })
    }
    return true
  }

  /** The rally itself: the ball arcs from paddle to table to paddle; now and then someone misses and it gets away. */
  private async rally(a: Actor, b: Actor) {
    const ball = this.fixtures.pongBall
    const table = FIXTURES.pong
    const tableY = 0.82
    const ends = [{ x: table.x - 1.7, z: table.z }, { x: table.x + 1.7, z: table.z }]
    const score = [0, 0]
    const until = this.time + 14 + Math.random() * 14
    const interrupted = () => a.queued > 1 || b.queued > 1
    let side = 0
    let z = table.z
    while (this.time < until && !interrupted()) {
      const hitter = side === 0 ? a : b
      const receiver = side === 0 ? b : a
      ball.visible = true
      void hitter.play('swing')
      const to = ends[1 - side]!
      const from = ends[side]!
      const toZ = table.z + (Math.random() - 0.5) * 1.0
      const miss = Math.random() < 0.12
      const dur = 0.55 + Math.random() * 0.25
      const bounce = 0.55
      // A return arcs to the table and on to the receiver's paddle. A miss only gets as far as the table.
      const flight = miss ? dur * bounce : dur
      const start = this.time
      while (this.time - start < flight) {
        const k = (this.time - start) / dur
        const y = k < bounce
          ? 1.15 + (tableY - 1.15) * (k / bounce) + Math.sin((k / bounce) * Math.PI) * 0.45
          : tableY + (1.15 - tableY) * ((k - bounce) / (1 - bounce)) + Math.sin(((k - bounce) / (1 - bounce)) * Math.PI) * 0.35
        ball.position.set(from.x + (to.x - from.x) * k, y, z + (toZ - z) * k)
        await this.wait(0)
      }
      z = toZ
      if (miss) {
        score[side]! += 1
        this.bubble(['argh!', 'net!', '😩', 'lucky…'][Math.floor(Math.random() * 4)]!, this.headOf(receiver), 0.36)
        this.bubble(`${score[0]}–${score[1]}`, this.headOf(hitter), 0.36)
        await this.slip(ball, side === 0 ? 1 : -1, receiver)
        // Back to the end of the table; whoever lost the point serves next.
        await this.goTo(receiver, receiver === a ? 'pong:w' : 'pong:e')
        receiver.face(receiver === a ? Math.PI / 2 : -Math.PI / 2)
        await this.wait(0.4)
        z = table.z
        side = 1 - side
        continue
      }
      if (Math.random() < 0.08) this.bubble('pok', { x: ball.position.x, y: 1.6, z: ball.position.z }, 0.3)
      side = 1 - side
    }
    ball.visible = false
    const winner = score[0] === score[1] ? null : score[0]! > score[1]! ? a : b
    if (winner) {
      this.bubble('🏆', this.headOf(winner))
      await winner.play('cheer')
    } else {
      this.bubble(interrupted() ? 'gotta go!' : 'gg', this.headOf(a), 0.36)
    }
  }

  /**
   * A ball that got past `receiver`: it leaves the table over the end, drops to the floor, bounces off the
   * floor and whatever it meets, differently every time, until it lies still. The receiver runs after it,
   * picks it up and is done when the ball is in hand.
   */
  private async slip(ball: THREE.Object3D, dir: number, receiver: Actor) {
    const world = this.ballWorld()
    const state = {
      pos: ball.position.clone(),
      vel: new THREE.Vector3(dir * (3 + Math.random() * 1.8), 1.8 + Math.random() * 1.2, (Math.random() - 0.5) * 2)
    }
    // Run after it while it is flying about. Close by, stand and watch where it goes; once it rolls slowly
    // along the floor, bend over and creep up on it. A ball still rolling can get away from the slow hands.
    type Pursuit = 'run' | 'watch' | 'stoop'
    let mode: Pursuit = 'run'
    let since = this.time
    let standUntil = 0
    let last = this.time
    const giveUp = this.time + 16
    while (this.time < giveUp) {
      await this.wait(0)
      const dt = Math.min(0.1, this.time - last)
      last = this.time
      stepBall(state, dt, world)
      ball.position.copy(state.pos)
      const dist = Math.hypot(receiver.position.x - state.pos.x, receiver.position.z - state.pos.z)
      const speed = Math.hypot(state.vel.x, state.vel.z)
      const slow = state.pos.y < 0.15 && Math.abs(state.vel.y) < 0.8 && speed < 1.1
      const before: Pursuit = mode
      if (dist > 2.4) mode = 'run'
      else if (mode === 'run' && dist < 1.5) mode = 'watch'
      else if (mode === 'watch' && slow && this.time - since > 0.6) mode = 'stoop'
      else if (mode === 'stoop' && !slow) mode = 'watch'
      if (mode !== before) since = this.time
      receiver.stooped = mode === 'stoop'
      receiver.pace = mode === 'stoop' ? 0.3 : 1
      // Every stop lasts at least half a second, so a ball creeping off never makes the legs stop and start.
      const mayWalk = receiver.walking || this.time >= standUntil
      if (mode === 'run') {
        // One continuous run, aimed a step short of the ball. Catching up is not a stop.
        if (mayWalk) receiver.steer(shortOf(state.pos, receiver.position, 0.4))
      } else if (mode === 'watch' || dist < 0.5) {
        if (receiver.walking) standUntil = this.time + 0.5
        receiver.settle()
        receiver.faceToward(state.pos)
      } else if (receiver.walking || (dist > 0.7 && mayWalk)) {
        receiver.steer(shortOf(state.pos, receiver.position, 0.3))
      }
      if (mode === 'stoop' && dist < 0.5 && speed < 0.6) break
    }
    receiver.settle()
    receiver.faceToward(state.pos)
    this.bubble(['got it!', 'sorry!', '😮‍💨', 'every time…'][Math.floor(Math.random() * 4)]!, this.headOf(receiver), 0.32)
    await receiver.play('reach')
    receiver.stooped = false
    receiver.pace = 1
    ball.visible = false
  }

  /** What a loose ball bounces off: the room, every desk, the fixtures and the ping-pong table. */
  private ballWorld(): BallWorld {
    const boxes: THREE.Box3[] = []
    for (const parts of this.desks.values()) {
      parts.group.updateMatrixWorld(true)
      boxes.push(new THREE.Box3().setFromObject(parts.group))
    }
    for (const solid of this.fixtures.solids) {
      solid.updateMatrixWorld(true)
      boxes.push(new THREE.Box3().setFromObject(solid))
    }
    const t = FIXTURES.pong
    boxes.push(new THREE.Box3(new THREE.Vector3(t.x - 1.37, 0, t.z - 0.76), new THREE.Vector3(t.x + 1.37, 0.79, t.z + 0.76)))
    return { boxes, room: ROOM, radius: 0.05, random: Math.random }
  }

  /** Starts a ping-pong match straight away if two people are free. For watching it without waiting. */
  startPong(): boolean {
    return this.maybePong(0, true)
  }

  // ── Effects ────────────────────────────────────────────────────────────────

  private headOf(actor: Actor): THREE.Vector3 {
    const p = actor.position
    // Above the name tag, so a bubble never hides who said it.
    return new THREE.Vector3(p.x, actor.away ? 3.85 : 3.55, p.z)
  }

  private bubble(text: string, at: P3, height = 0.5, bg = '#ffffff', drift = false) {
    const sprite = textSprite(text, { bg, height, border: '#00000030' })
    this.scene.add(sprite)
    sprite.position.set(at.x, at.y, at.z)
    this.floaters.push({
      obj: sprite,
      vel: new THREE.Vector3(drift ? 0.25 : 0, 0.55, 0),
      life: drift ? 2.2 : 1.8,
      age: 0,
      gravity: 0,
      fade: sprite.material,
      wall: true
    })
  }

  private particle(geometry: THREE.BufferGeometry, color: string, at: P3, vel: THREE.Vector3, life: number, gravity: number, emissive = false) {
    const material = emissive
      ? new THREE.MeshBasicMaterial({ color, transparent: true })
      : new THREE.MeshStandardMaterial({ color, transparent: true, side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(at.x, at.y, at.z)
    this.scene.add(mesh)
    this.floaters.push({
      obj: mesh,
      vel,
      life,
      age: 0,
      gravity,
      spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
      fade: material
    })
  }

  private sparks(at: P3, n = 10) {
    const g = new THREE.BoxGeometry(0.05, 0.05, 0.05)
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4)
      this.particle(g, Math.random() < 0.5 ? '#ffd60a' : '#ff8800', at, v, 0.6, 12, true)
    }
  }

  private keys(actor: Actor) {
    const g = new THREE.BoxGeometry(0.08, 0.08, 0.02)
    const colors = ['#4cc9f0', '#f72585', '#b5e48c', '#ffd60a']
    const z = actor.position.z + (actor.facing === 0 ? 0.9 : -0.9)
    for (let i = 0; i < 3; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 1.5, 1.8 + Math.random(), (Math.random() - 0.5) * 1.5)
      this.particle(g, colors[i % 4]!, { x: actor.position.x, y: 0.95, z }, v, 0.9, 5, true)
    }
  }

  private confetti(at: P3) {
    const g = new THREE.PlaneGeometry(0.12, 0.08)
    const colors = ['#f72585', '#7209b7', '#3a0ca3', '#4cc9f0', '#ffd60a', '#06d6a0']
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2
      const v = new THREE.Vector3(Math.cos(a) * (1 + Math.random() * 3), 4 + Math.random() * 4, Math.sin(a) * (1 + Math.random() * 3))
      this.particle(g, colors[i % colors.length]!, at, v, 2.6, 6)
    }
  }

  private puff(at: P3, color: string, n: number) {
    const g = new THREE.SphereGeometry(0.15, 8, 6)
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.2, (Math.random() - 0.5) * 2)
      this.particle(g, color, at, v, 0.9, -0.5)
    }
  }

  private strip(at: P3) {
    const g = new THREE.BoxGeometry(0.03, 0.25, 0.01)
    const v = new THREE.Vector3((Math.random() - 0.5) * 0.6, -0.5, -0.8 - Math.random())
    this.particle(g, '#f8f9fa', { x: at.x + (Math.random() - 0.5) * 0.5, y: at.y - 0.1, z: at.z - 0.3 }, v, 1.0, 4)
  }

  /** A bug crawls out of the jar, runs a lap of the office and goes back in. */
  private releaseBug() {
    const bug = buildBug()
    bug.scale.setScalar(2.4)
    bug.position.set(FIXTURES.jar.x, 0.05, FIXTURES.jar.z - 0.8)
    this.scene.add(bug)
    this.wanderers.push({ obj: bug, until: this.time + 7, target: { x: FIXTURES.jar.x - 4, z: 5 } })
  }

  private tickWanderers(dt: number) {
    this.wanderers = this.wanderers.filter((w) => {
      const p = w.obj.position
      const homeward = this.time > w.until
      const target = homeward ? { x: FIXTURES.jar.x, z: FIXTURES.jar.z - 0.6 } : w.target
      const dx = target.x - p.x
      const dz = target.z - p.z
      const d = Math.hypot(dx, dz)
      if (d < 0.3) {
        if (homeward) {
          w.obj.removeFromParent()
          return false
        }
        w.target = { x: -10 + Math.random() * 14, z: -2 + Math.random() * 9 }
        return true
      }
      const speed = 3.2 * dt
      p.x += (dx / d) * speed + Math.sin(this.time * 30) * 0.01
      p.z += (dz / d) * speed
      w.obj.rotation.y = Math.atan2(dx, dz)
      return true
    })
  }

  /** `wall` is real seconds: speech bubbles age by it, so they stay readable at 4× and never linger on a slow frame rate. */
  private tickFloaters(dt: number, wall: number) {
    this.floaters = this.floaters.filter((f) => {
      f.age += f.wall ? wall : dt
      if (f.age >= f.life) {
        f.obj.removeFromParent()
        if ((f.obj as THREE.Mesh).geometry && !(f.obj as THREE.Sprite).isSprite) (f.obj as THREE.Mesh).geometry.dispose()
        const m = f.fade as THREE.SpriteMaterial | undefined
        m?.map?.dispose()
        m?.dispose()
        return false
      }
      f.vel.y -= f.gravity * dt
      f.obj.position.addScaledVector(f.vel, dt)
      if (f.obj.position.y < 0.02 && f.gravity > 0) {
        f.obj.position.y = 0.02
        f.vel.set(0, 0, 0)
        f.spin = undefined
      }
      if (f.spin) {
        f.obj.rotation.x += f.spin.x * dt
        f.obj.rotation.y += f.spin.y * dt
      }
      if (f.fade) {
        const left = f.life - f.age
        ;(f.fade as THREE.Material).opacity = Math.min(1, left / 0.5)
      }
      return true
    })
  }

  private tickFixtures() {
    const fx = this.fixtures
    // The siren spins while anything sits on the blocked shelf, and blazes for a moment after a new one.
    const stuck = [...this.folders.values()].some(f => f.place === SHELF)
    const blazing = this.time - this.sirenBoost < 4
    const on = stuck || blazing
    fx.siren.beam.rotation.y = this.time * (blazing ? 9 : 4)
    fx.siren.light.intensity = on ? (blazing ? 40 : 14) * (0.6 + 0.4 * Math.abs(Math.sin(this.time * 6))) : 0
    ;(fx.siren.lamp.material as THREE.MeshStandardMaterial).emissive.set(on ? '#ff0000' : '#330000')
    ;(fx.siren.lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 1.2 + Math.sin(this.time * 12) : 0.4

    // The rocket goes up through the roof and comes back down for the next one.
    const since = this.time - this.rocketLaunch
    if (since >= 0 && since < 4) {
      if (since < 2.2) {
        fx.rocket.position.y = 0.32 + since * since * 4
        if (Math.random() < 0.8) this.puff({ x: FIXTURES.pad.x + 0.3, y: Math.max(0.4, fx.rocket.position.y), z: FIXTURES.pad.z }, Math.random() < 0.5 ? '#ffba08' : '#adb5bd', 2)
      } else {
        fx.rocket.position.y = Math.max(0.32, 20 - (since - 2.2) * 12)
      }
    } else {
      fx.rocket.position.y = 0.32
    }
    fx.rocket.rotation.y = since < 4 ? since * 3 : 0

    // One bug in the jar for every folder in Bugs.
    const bugs = [...this.folders.values()].filter(f => f.place === JAR).length
    while (fx.jarBugs.children.length < Math.min(bugs, 8)) fx.jarBugs.add(buildBug())
    while (fx.jarBugs.children.length > Math.min(bugs, 8)) fx.jarBugs.children[0]!.removeFromParent()
    fx.jarBugs.children.forEach((bug, i) => {
      const a = this.time * (0.8 + i * 0.2) + i * 1.7
      bug.position.set(Math.cos(a) * 0.3, 0.1 + Math.abs(Math.sin(a * 2)) * 0.5, Math.sin(a) * 0.3)
      bug.rotation.y = -a
    })

    const now = new Date()
    const minutes = now.getMinutes() + now.getSeconds() / 60
    this.room.clockHands.minute.rotation.z = -(minutes / 60) * Math.PI * 2
    this.room.clockHands.hour.rotation.z = -(((now.getHours() % 12) + minutes / 60) / 12) * Math.PI * 2

    for (const [key, at] of this.shake) {
      const desk = this.desks.get(key)
      const k = this.time - at
      if (!desk || k > 0.25) {
        desk?.monitor.position.setX(0)
        this.shake.delete(key)
        continue
      }
      desk.monitor.position.x = Math.sin(k * 90) * 0.06
    }
  }

  // ── Screens and the whiteboard ─────────────────────────────────────────────

  private paintScreens() {
    for (const [key, desk] of this.desks) {
      const actor = this.actors.get(key)
      if (actor) this.paintScreen(desk.screen, actor)
    }
  }

  private paintScreen(s: Painted, actor: Actor) {
    const { ctx, w, h } = s
    const t = this.time
    const deskTitle = [...this.folders.values()].find(f => f.place === `${actor.key}:desk`)?.title
    ctx.fillStyle = '#0d1117'
    ctx.fillRect(0, 0, w, h)
    ctx.font = 'bold 13px ui-monospace, monospace'
    ctx.textBaseline = 'top'
    if (actor.away) {
      ctx.fillStyle = '#30363d'
      ctx.fillText('brb', w / 2 - 12, h / 2 - 6)
    } else if (actor.activity === 'idle' && actor.idleStyle === 'game' && !actor.playing) {
      this.paintShooter(s, t + actor.position.x)
    } else if (actor.activity === 'idle') {
      const x = (Math.sin(t * 0.7) * 0.5 + 0.5) * (w - 60)
      const y = (Math.cos(t * 0.9) * 0.5 + 0.5) * (h - 20)
      ctx.fillStyle = '#7b2cbf'
      ctx.fillText(actor.idleStyle === 'doze' ? 'z z z' : '◆ ◆ ◆', x, y)
    } else if (actor.activity === 'working') {
      ctx.fillStyle = '#161b22'
      ctx.fillRect(0, 0, w, 18)
      ctx.fillStyle = '#c9d1d9'
      ctx.fillText((deskTitle ?? 'task').slice(0, 22), 6, 3)
      const colors = ['#ff7b72', '#79c0ff', '#d2a8ff', '#a5d6ff', '#7ee787', '#ffa657']
      const scroll = Math.floor(t * 6)
      for (let i = 0; i < 8; i++) {
        const n = (scroll + i) * 7919
        ctx.fillStyle = colors[n % colors.length]!
        const indent = (n % 4) * 10
        ctx.fillRect(8 + indent, 24 + i * 11, 20 + (n % 90), 6)
      }
      const fail = Math.sin(t * 0.37 + actor.position.x) > 0.93
      const pass = Math.sin(t * 0.29 + actor.position.x) > 0.95
      if (fail || pass) {
        ctx.fillStyle = fail ? '#da3633' : '#238636'
        ctx.fillRect(0, h - 24, w, 24)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(fail ? 'BUILD FAILED' : 'TESTS PASS ✓', 8, h - 19)
      }
    } else if (actor.activity === 'eyeing-todo') {
      ctx.fillStyle = Math.floor(t * 2) % 2 ? '#ffa657' : '#d29922'
      ctx.fillText('📥 NEW TASK!', 18, h / 2 - 8)
    } else if (actor.activity === 'reviewing') {
      for (let i = 0; i < 9; i++) {
        const n = (Math.floor(t * 2) + i) * 104729
        ctx.fillStyle = n % 3 === 0 ? '#3fb95033' : n % 3 === 1 ? '#f8514933' : '#00000000'
        ctx.fillRect(0, 6 + i * 11, w, 10)
        ctx.fillStyle = n % 3 === 0 ? '#7ee787' : n % 3 === 1 ? '#ff7b72' : '#8b949e'
        ctx.fillRect(14, 9 + i * 11, 30 + (n % 80), 4)
      }
    } else {
      // Pia's planning board in miniature.
      const columns = 4
      for (let c = 0; c < columns; c++) {
        ctx.fillStyle = '#161b22'
        ctx.fillRect(6 + c * ((w - 12) / columns), 6, (w - 12) / columns - 4, h - 12)
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = ['#e2557a', '#ffd166', '#06d6a0', '#118ab2'][(c + i) % 4]!
          ctx.fillRect(10 + c * ((w - 12) / columns), 12 + i * 18 + Math.sin(t + c) * 2, (w - 12) / columns - 12, 12)
        }
      }
    }
    s.texture.needsUpdate = true
  }

  /** A tiny first-person shooter: skyline, enemies strafing, a jittery crosshair and the odd muzzle flash. */
  private paintShooter(s: Painted, t: number) {
    const { ctx, w, h } = s
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.6)
    sky.addColorStop(0, '#3a0ca3')
    sky.addColorStop(1, '#f72585')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h * 0.6)
    ctx.fillStyle = '#2b2d42'
    ctx.fillRect(0, h * 0.6, w, h * 0.4)
    ctx.fillStyle = '#14213d'
    for (let i = 0; i < 6; i++) {
      const bw = 18 + ((i * 37) % 20)
      const bh = 20 + ((i * 53) % 30)
      ctx.fillRect(i * 34, h * 0.6 - bh, bw, bh)
    }
    for (let i = 0; i < 3; i++) {
      const ex = ((Math.sin(t * (0.8 + i * 0.37) + i * 2) * 0.5 + 0.5) * (w - 30)) + 10
      const ey = h * 0.6 - 18 + i * 6
      ctx.fillStyle = '#e63946'
      ctx.fillRect(ex, ey, 9, 16)
      ctx.fillStyle = '#ffd166'
      ctx.fillRect(ex + 2, ey + 3, 5, 3)
    }
    const cx = w / 2 + Math.sin(t * 9) * 14
    const cy = h * 0.5 + Math.cos(t * 7) * 8
    ctx.strokeStyle = '#06d6a0'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx - 9, cy)
    ctx.lineTo(cx + 9, cy)
    ctx.moveTo(cx, cy - 9)
    ctx.lineTo(cx, cy + 9)
    ctx.stroke()
    if (Math.sin(t * 13) > 0.8) {
      ctx.fillStyle = '#ffd60a'
      ctx.beginPath()
      ctx.arc(w * 0.72, h - 14, 10, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = '#adb5bd'
    ctx.fillRect(w * 0.62, h - 18, w * 0.3, 18)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 11px ui-monospace, monospace'
    ctx.fillText(`K ${Math.floor(t / 3) % 40}`, 6, 4)
    ctx.fillStyle = '#ef476f'
    ctx.fillRect(w - 56, 6, 50 * (0.3 + 0.7 * (Math.sin(t * 0.3) * 0.5 + 0.5)), 6)
  }

  private drawWhiteboard() {
    const s = this.room.whiteboard
    const { ctx, w, h } = s
    const snap = this.snapshot
    ctx.fillStyle = '#fbfbf8'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#1d3557'
    ctx.font = 'bold 26px "Comic Sans MS", "Chalkboard SE", system-ui'
    ctx.textBaseline = 'top'
    ctx.fillText(snap ? `${snap.boardName}${snap.crewName ? ` · ${snap.crewName}` : ''}` : 'The office', 18, 12)
    const days = Math.floor((Date.now() - this.bugFreeSince) / 60000)
    ctx.fillStyle = '#e63946'
    ctx.font = 'bold 18px "Comic Sans MS", "Chalkboard SE", system-ui'
    ctx.fillText(`${days} min without a new bug`, 18, 46)
    // The header has its own band; the chart starts below the rule, so a tall bar's count never
    // lands on the header's text.
    const rule = 74
    ctx.fillStyle = '#ced4da'
    ctx.fillRect(18, rule, w - 36, 2)
    if (!snap) {
      s.texture.needsUpdate = true
      return
    }
    const order = ['Backlog', 'To do', 'In progress', 'Verify PM', 'Verify UX', 'Verify CQ', 'Verify QA', 'Verify', 'Ready for live', 'Done', 'Blocked', 'Bugs']
    const counts = new Map<string, number>()
    for (const t of snap.tasks) counts.set(t.column, (counts.get(t.column) ?? 0) + 1)
    const names = [...new Set([...order.filter(n => counts.has(n)), ...counts.keys()])]
    const max = Math.max(1, ...counts.values())
    const colW = (w - 36) / Math.max(names.length, 1)
    const baseline = h - 34
    const countHeight = 24
    const tallest = baseline - (rule + 6) - countHeight
    names.forEach((name, i) => {
      const x = 18 + i * colW
      const n = counts.get(name) ?? 0
      const barH = (n / max) * tallest
      ctx.fillStyle = ['#ffd166', '#06d6a0', '#118ab2', '#ef476f', '#8338ec', '#ff9f1c'][i % 6]!
      ctx.fillRect(x + 6, baseline - barH, colW - 12, barH)
      ctx.fillStyle = '#212529'
      ctx.font = 'bold 20px system-ui'
      const label = String(n)
      ctx.fillText(label, x + colW / 2 - ctx.measureText(label).width / 2, baseline - barH - countHeight + 2)
      ctx.font = '14px system-ui'
      ctx.fillText(name.length > 11 ? `${name.slice(0, 10)}…` : name, x + 4, baseline + 8)
    })
    s.texture.needsUpdate = true
  }

  // ── Hover ──────────────────────────────────────────────────────────────────

  private onPointer = (e: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  private onLeave = () => {
    this.pointer = null
    this.hooks.onHover?.(null)
  }

  private pick() {
    if (!this.pointer || !this.hooks.onHover) return
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2((this.pointer.x / rect.width) * 2 - 1, -(this.pointer.y / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
    const targets: THREE.Object3D[] = [...[...this.folders.values()].map(f => f.obj), ...[...this.actors.values()].map(a => a.rig.root)]
    const hit = this.raycaster.intersectObjects(targets, true).find(h => !(h.object as THREE.Sprite).isSprite)
    if (!hit) {
      this.hooks.onHover(null)
      return
    }
    const folderId = hit.object.userData.folderId as string | undefined
    if (folderId) {
      const f = this.folders.get(folderId)
      if (f) {
        this.hooks.onHover({ kind: 'folder', title: f.title, detail: f.column || 'Carried', x: this.pointer.x, y: this.pointer.y })
        return
      }
    }
    const key = hit.object.userData.actorKey as string | undefined
    if (key === COURIER) {
      this.hooks.onHover({ kind: 'person', title: 'The courier', detail: 'brings new tasks from the real board to the Boss', x: this.pointer.x, y: this.pointer.y })
      return
    }
    const actor = key ? this.actors.get(key) : undefined
    if (actor) {
      const mine = [...this.folders.values()].filter(f => f.place && ownerOf(f.place) === actor.key).length
      const idleName = actor.playing ? 'playing ping-pong' : IDLE_NAMES[actor.idleStyle]
      const doing = actor.away && !actor.playing
        ? (actor.carrying ? 'carrying a folder' : 'on the move')
        : actor.activity === 'idle' ? idleName : ACTIVITY_NAMES[actor.activity] ?? actor.activity
      this.hooks.onHover({
        kind: 'person',
        title: actor.person.name,
        detail: `${ROLE_NAMES[actor.person.role]} · ${doing} · ${mine} folder${mine === 1 ? '' : 's'} · ${actor.statusText}`,
        x: this.pointer.x,
        y: this.pointer.y
      })
      return
    }
    this.hooks.onHover(null)
  }

  // ── Loop ───────────────────────────────────────────────────────────────────

  private ticker(errand: Errand) {
    this.hooks.onTicker?.(describeErrand(errand, this.cast))
  }

  private fit() {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private tick = (now: number) => {
    if (this.disposed) return
    this.frame = requestAnimationFrame(this.tick)
    // Real seconds since the last frame; a hidden tab stops the loop, so cap the gap at a second.
    const wall = Math.min(1, Math.max(0, (now - this.last) / 1000))
    const real = Math.min(0.1, wall)
    this.last = now
    // A long queue plays faster, so the office never falls far behind the board.
    const hurry = 1 + Math.min(3, this.backlog / 6)
    const dt = real * this.speed * hurry
    this.time += dt

    const due = this.timers.filter(t => t.at <= this.time)
    this.timers = this.timers.filter(t => t.at > this.time)
    for (const t of due) t.done()

    for (const actor of this.actors.values()) actor.update(dt)
    this.courier?.update(dt)
    // Ping-pong needs only two idle people, not a quiet office: a busy board still has its idle hands.
    this.maybePong(dt)
    this.maybeWander(dt)
    this.maybeBoss(dt)
    this.tickFloaters(dt, wall)
    this.tickWanderers(dt)
    this.tickFixtures()
    this.screenTick += real
    if (this.screenTick > 0.15) {
      this.screenTick = 0
      this.paintScreens()
      this.pick()
    }
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }
}
