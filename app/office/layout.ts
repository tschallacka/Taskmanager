// The floor plan: where every desk, tray and fixture stands, and the aisles people walk along.
// Plain numbers only, so it can be reasoned about (and tested) without a renderer.
//
// Seen from above, x to the right, z toward the viewer:
//
//   back wall ── whiteboard, clock ───────────────────────────────
//   row A   [wren] [wick] [wynn] [wade]          workers, facing the wall
//   ─ ─ ─ ─ ─ ─ ─ ─ corridor ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
//   row B   [usher] [nina] [quincy]      ┌──────────────┐
//   shelf                                 │ Boss's office │
//   coffee            [ Pia's desk ]      │              │
//   ─ ─ ─ ─ ─ ─ front aisle ─ ─ ─ ─ ─ ─ ─ └──────────────┘
//   archive  shredder        bug jar          rocket pad
import type { OfficePerson, Place } from '../../shared/office/model'
import { ownerOf, slotOf } from '../../shared/office/model'

export interface P { x: number, z: number }
export interface P3 { x: number, y: number, z: number }

/** A heading in radians: 0 faces +z (the viewer), PI faces the back wall. */
export type Heading = number

export interface Desk {
  key: string
  kind: 'row-a' | 'row-b' | 'pm' | 'boss'
  center: P
  seat: P
  facing: Heading
  /** The tray others drop folders into: todo for a worker, review for a reviewer, inbox for the Boss. */
  tray: P3
  /** Where the folder being worked on lies. */
  work: P3
}

export const ROOM = { minX: -17, maxX: 17, minZ: -14, maxZ: 12, height: 7 }
export const ROW_A_Z = -11.1
export const ROW_B_Z = -2.5
const CORRIDOR_Z = -6.8
const MID_Z = 0.8
const FRONT_Z = 8.3
const LEFT_X = -14.8
const RIGHT_X = 4.6
const SLOTS_A = [-12, -7.2, -2.4, 2.4, 7.2, 12]
const SLOTS_B = [-12, -7.2, -2.4, 2.4]

export const PIA_DESK: P = { x: -3, z: 3.8 }
export const BOSS_ROOM = { minX: 6.8, maxX: 16.6, minZ: -4, maxZ: 7, doorMinZ: 0.3, doorMaxZ: 2.7 }
export const TUBE_POS: P3 = { x: -4.5, y: 2.2, z: 4.1 }
export const DELIVERY_DOOR_Z = 9.6
/**
 * The Boss's putting green: the ball on the tee, the hole at the far end along +x, and where he stands.
 * He stands beside the line, side-on to the hole, facing the ball (+z) with the hole on his left.
 */
export const GOLF = { stand: { x: 10.75, z: -3.4 }, tee: { x: 10.75, z: -2.8 }, hole: { x: 12.5, z: -2.8 } }
const DELIVERY_X = 14.8

export const FIXTURES = {
  archive: { x: -14.2, z: 10 },
  shredder: { x: -10.5, z: 10.1 },
  jar: { x: 1.5, z: 10.2 },
  pad: { x: 8.5, z: 9.8 },
  shelf: { x: -16.3, z: -3.2 },
  coffee: { x: -16.3, z: 3.5 },
  cooler: { x: -16.3, z: 6.3 },
  pong: { x: -10.3, z: 4.6 }
}

export class Graph {
  readonly nodes = new Map<string, P>()
  private edges = new Map<string, Set<string>>()

  add(id: string, p: P): string {
    this.nodes.set(id, p)
    if (!this.edges.has(id)) this.edges.set(id, new Set())
    return id
  }

  link(...ids: string[]) {
    for (let i = 1; i < ids.length; i++) {
      this.edges.get(ids[i - 1]!)!.add(ids[i]!)
      this.edges.get(ids[i]!)!.add(ids[i - 1]!)
    }
  }

  /** The shortest walk between two nodes, as points (the start excluded). Empty when unreachable. */
  path(from: string, to: string): P[] {
    if (from === to) return []
    const dist = new Map<string, number>([[from, 0]])
    const prev = new Map<string, string>()
    const open = new Set([from])
    while (open.size) {
      let current = ''
      let best = Infinity
      for (const id of open) {
        const d = dist.get(id)!
        if (d < best) {
          best = d
          current = id
        }
      }
      open.delete(current)
      if (current === to) break
      const here = this.nodes.get(current)!
      for (const next of this.edges.get(current) ?? []) {
        const there = this.nodes.get(next)!
        const d = best + Math.hypot(there.x - here.x, there.z - here.z)
        if (d < (dist.get(next) ?? Infinity)) {
          dist.set(next, d)
          prev.set(next, current)
          open.add(next)
        }
      }
    }
    if (!prev.has(to)) return []
    const out: P[] = []
    for (let id = to; id !== from; id = prev.get(id)!) out.unshift(this.nodes.get(id)!)
    return out
  }

  nearest(p: P): string {
    let best = ''
    let bestD = Infinity
    for (const [id, n] of this.nodes) {
      const d = Math.hypot(n.x - p.x, n.z - p.z)
      if (d < bestD) {
        bestD = d
        best = id
      }
    }
    return best
  }
}

function centred(slots: number[], count: number): number[] {
  if (count >= slots.length) return slots.slice()
  const start = Math.floor((slots.length - count) / 2)
  return slots.slice(start, start + count)
}

export interface Layout {
  desks: Map<string, Desk>
  graph: Graph
  pia: string
  boss: string
  /** Where the i-th folder of a place lies. */
  folderAt(place: Place, index: number): P3
  /** The node someone stands on to reach a place. */
  approach(place: Place, who: string): string
  seatNode(key: string): string
}

export function buildLayout(cast: OfficePerson[]): Layout {
  const graph = new Graph()
  const desks = new Map<string, Desk>()
  const pia = cast.find(p => p.role === 'pm')?.key ?? 'pia'
  const boss = cast.find(p => p.role === 'boss')?.key ?? 'boss'
  const workers = cast.filter(p => p.role === 'worker')
  const reviewers = cast.filter(p => p.role === 'ux' || p.role === 'cq' || p.role === 'qa')

  // Workers fill row A from the middle out; whoever does not fit sits in row B after the reviewers.
  const rowA = workers.slice(0, SLOTS_A.length)
  const rowB = [...reviewers, ...workers.slice(SLOTS_A.length)].slice(0, SLOTS_B.length)
  const xsA = centred(SLOTS_A, rowA.length)
  const xsB = SLOTS_B.slice(0, rowB.length)

  // The corridor between the rows, one node under every cubicle.
  const corridorXs = [...new Set([LEFT_X, ...xsA, ...xsB, RIGHT_X, 14.8])].sort((a, b) => a - b)
  const corridor = corridorXs.map(x => graph.add(`c:${x}`, { x, z: CORRIDOR_Z }))
  graph.link(...corridor)
  const corridorAt = (x: number) => `c:${x}`

  rowA.forEach((person, i) => {
    const x = xsA[i]!
    desks.set(person.key, {
      key: person.key,
      kind: 'row-a',
      center: { x, z: ROW_A_Z },
      seat: { x, z: ROW_A_Z + 1.4 },
      facing: Math.PI,
      tray: { x: x + 1.7, y: 0.95, z: -8.9 },
      work: { x: x - 0.9, y: 0.8, z: ROW_A_Z + 0.35 }
    })
    graph.add(`seat:${person.key}`, { x, z: ROW_A_Z + 1.4 })
    graph.add(`stand:${person.key}`, { x, z: -8.2 })
    graph.add(`tray:${person.key}`, { x: x + 1.5, z: -7.7 })
    graph.link(`seat:${person.key}`, `stand:${person.key}`, corridorAt(x), `tray:${person.key}`, `stand:${person.key}`)
  })

  rowB.forEach((person, i) => {
    const x = xsB[i]!
    desks.set(person.key, {
      key: person.key,
      kind: 'row-b',
      center: { x, z: ROW_B_Z },
      seat: { x, z: ROW_B_Z - 1.4 },
      facing: 0,
      // The cubicle is turned round, so its tray stands on the left as seen from above.
      tray: { x: x - 1.7, y: 0.95, z: ROW_B_Z - 2.2 },
      work: { x: x + 0.9, y: 0.8, z: ROW_B_Z - 0.35 }
    })
    graph.add(`seat:${person.key}`, { x, z: ROW_B_Z - 1.4 })
    graph.add(`stand:${person.key}`, { x, z: -5.3 })
    graph.add(`tray:${person.key}`, { x: x - 1.5, z: -5.8 })
    graph.link(`seat:${person.key}`, `stand:${person.key}`, corridorAt(x), `tray:${person.key}`, `stand:${person.key}`)
  })

  // Pia's desk sits in the open, trays toward the front so people can drop folders in.
  desks.set(pia, {
    key: pia,
    kind: 'pm',
    center: PIA_DESK,
    seat: { x: PIA_DESK.x, z: PIA_DESK.z - 1.3 },
    facing: 0,
    tray: { x: -4.5, y: 0.82, z: 4.1 },
    work: { x: -1.5, y: 0.82, z: 4.1 }
  })

  // The mid aisle behind Pia, the left wall aisle, the right aisle by the Boss's door, the front aisle.
  const midXs = [LEFT_X, -6.2, PIA_DESK.x, 0.2, RIGHT_X]
  const mid = midXs.map(x => graph.add(`m:${x}`, { x, z: MID_Z }))
  graph.link(...mid)
  const frontXs = [LEFT_X, FIXTURES.archive.x, FIXTURES.shredder.x, -6.2, -4.5, -1.5, 0.2, FIXTURES.jar.x, RIGHT_X, FIXTURES.pad.x, DELIVERY_X]
  const front = [...new Set(frontXs)].sort((a, b) => a - b).map(x => graph.add(`f:${x}`, { x, z: FRONT_Z }))
  graph.link(...front)
  // The delivery door in the right wall; `street` is outside it, where the courier waits between parcels.
  graph.add('door:in', { x: ROOM.maxX - 1.2, z: DELIVERY_DOOR_Z })
  graph.add('street', { x: ROOM.maxX + 0.6, z: DELIVERY_DOOR_Z })
  graph.link(`f:${DELIVERY_X}`, 'door:in', 'street')

  graph.add('shelf', { x: LEFT_X, z: FIXTURES.shelf.z })
  graph.add('coffee', { x: LEFT_X, z: FIXTURES.coffee.z })
  graph.link(corridorAt(LEFT_X), 'shelf', `m:${LEFT_X}`, 'coffee', `f:${LEFT_X}`)
  graph.add('r:door', { x: RIGHT_X, z: 1.5 })
  graph.link(corridorAt(RIGHT_X), `m:${RIGHT_X}`, 'r:door', `f:${RIGHT_X}`)

  graph.add(`seat:${pia}`, desks.get(pia)!.seat)
  graph.link(`seat:${pia}`, `m:${PIA_DESK.x}`)
  graph.add('front:backlog', { x: -4.5, z: 5.7 })
  graph.add('front:verify', { x: -1.5, z: 5.7 })
  graph.add('pia:left', { x: -6.2, z: 5.7 })
  graph.add('pia:right', { x: 0.2, z: 5.7 })
  graph.link('m:-6.2', 'pia:left', 'front:backlog', 'front:verify', 'pia:right', 'm:0.2')
  graph.link('front:backlog', 'f:-4.5')
  graph.link('front:verify', 'f:-1.5')
  graph.link('pia:left', 'f:-6.2')
  graph.link('pia:right', 'f:0.2')

  // The Boss's glass office, entered through the door on its left wall.
  desks.set(boss, {
    key: boss,
    kind: 'boss',
    center: { x: 12, z: 1.5 },
    seat: { x: 13.5, z: 1.5 },
    facing: -Math.PI / 2,
    tray: { x: 11.5, y: 0.82, z: 0.3 },
    work: { x: 11.6, y: 0.82, z: 2.2 }
  })
  graph.add('boss:door', { x: 6.2, z: 1.5 })
  graph.add('boss:in', { x: 8.2, z: 1.5 })
  graph.add('boss:visitor', { x: 10.2, z: 0.3 })
  graph.add('boss:round', { x: 9.2, z: 4.4 })
  graph.add('boss:behind', { x: 13.5, z: 4.4 })
  graph.add(`seat:${boss}`, { x: 13.5, z: 1.5 })
  graph.link('r:door', 'boss:door', 'boss:in', 'boss:visitor')
  graph.link('boss:in', 'boss:round', 'boss:behind', `seat:${boss}`)
  // The putting green, for a Boss with nothing to read.
  graph.add('boss:green', { x: 10.4, z: -2.3 })
  graph.add('boss:corner', { x: 13.6, z: -2.3 })
  graph.link('boss:in', 'boss:green', 'boss:corner', `seat:${boss}`)
  // Where the Boss stands to sign for a parcel: in front of his desk, across from the courier.
  graph.add('boss:sign', { x: 11.2, z: -0.9 })
  graph.link('boss:visitor', 'boss:sign', 'boss:corner')
  graph.add('coffee:spot', { x: -15.3, z: FIXTURES.coffee.z })
  graph.link('coffee', 'coffee:spot')
  // The water cooler, on the same left aisle, and a spot beside each machine for a coworker to stand and chat.
  graph.add('cooler', { x: LEFT_X, z: FIXTURES.cooler.z })
  graph.add('cooler:spot', { x: -15.3, z: FIXTURES.cooler.z })
  graph.link('coffee', 'cooler', `f:${LEFT_X}`)
  graph.link('cooler', 'cooler:spot')
  graph.add('coffee:chat', { x: -13.9, z: FIXTURES.coffee.z - 0.5 })
  graph.link('coffee', 'coffee:chat')
  graph.add('cooler:chat', { x: -13.9, z: FIXTURES.cooler.z + 0.5 })
  graph.link('cooler', 'cooler:chat')
  // The ping-pong table: one end each, and a way round the side between them.
  graph.add('pong:w', { x: FIXTURES.pong.x - 2.2, z: FIXTURES.pong.z })
  graph.add('pong:e', { x: FIXTURES.pong.x + 2.2, z: FIXTURES.pong.z })
  graph.add('pong:n', { x: FIXTURES.pong.x, z: FIXTURES.pong.z - 1.9 })
  graph.link('coffee', 'pong:w', 'pong:n', 'pong:e', 'pia:left')
  graph.link('pong:n', 'm:-6.2')

  const fixtureNode = {
    archive: `f:${FIXTURES.archive.x}`,
    shredder: `f:${FIXTURES.shredder.x}`,
    jar: `f:${FIXTURES.jar.x}`,
    dock: `f:${FIXTURES.pad.x}`,
    shelf: 'shelf'
  }

  function folderAt(place: Place, index: number): P3 {
    const owner = ownerOf(place)
    const slot = slotOf(place)
    const lift = index * 0.07
    if (owner) {
      const desk = desks.get(owner)
      if (!desk) return { x: TUBE_POS.x, y: 0.82 + lift, z: TUBE_POS.z }
      if (owner === pia && slot === 'verify') return { x: -1.5, y: 0.86 + lift, z: 4.1 }
      if (owner === pia) return { x: -4.5, y: 0.86 + lift, z: 4.1 }
      if (slot === 'desk') return { x: desk.work.x + (index % 2) * 0.15, y: desk.work.y + lift, z: desk.work.z }
      return { x: desk.tray.x, y: desk.tray.y + lift, z: desk.tray.z }
    }
    switch (place) {
      case 'archive:done': return { x: FIXTURES.archive.x, y: 1.62 + lift, z: FIXTURES.archive.z }
      case 'jar:bugs': return { x: FIXTURES.jar.x + Math.sin(index * 2.1) * 0.15, y: 1.05 + index * 0.05, z: FIXTURES.jar.z + Math.cos(index * 2.1) * 0.15 }
      case 'dock:ready': return { x: FIXTURES.pad.x - 0.9, y: 0.38 + lift, z: FIXTURES.pad.z + 0.5 }
      case 'shelf:blocked': {
        const shelf = index % 3
        const along = Math.floor(index / 3)
        return { x: FIXTURES.shelf.x + 0.1, y: 0.55 + shelf * 0.7 + Math.floor(along / 6) * 0.07, z: FIXTURES.shelf.z - 0.8 + (along % 6) * 0.32 }
      }
      case 'shredder': return { x: FIXTURES.shredder.x, y: 1.1, z: FIXTURES.shredder.z }
      default: return { x: TUBE_POS.x, y: TUBE_POS.y + 2.5, z: TUBE_POS.z }
    }
  }

  function approach(place: Place, who: string): string {
    const owner = ownerOf(place)
    const slot = slotOf(place)
    if (place === 'tube') return who === pia ? `seat:${pia}` : 'front:backlog'
    if (place === 'shredder') return fixtureNode.shredder
    if (owner === pia) {
      if (who === pia) return `seat:${pia}`
      return slot === 'verify' ? 'front:verify' : 'front:backlog'
    }
    if (owner === boss) return who === boss ? `seat:${boss}` : 'boss:visitor'
    if (owner) {
      if (!desks.has(owner)) return 'front:backlog'
      return slot === 'desk' ? `seat:${owner}` : `tray:${owner}`
    }
    const fixture = place.split(':')[0] as keyof typeof fixtureNode
    return fixtureNode[fixture] ?? 'front:backlog'
  }

  return { desks, graph, pia, boss, folderAt, approach, seatNode: key => `seat:${key}` }
}
