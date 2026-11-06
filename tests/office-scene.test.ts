// The office scene itself, run frame by frame through the demo board without a browser: a renderer that
// draws nothing and a canvas that paints nothing, but the real scene, actors, errands and effects. It
// catches the frame loop dropping a step: someone not moving, or moving twice per frame, bubbles that
// never leave the scene or never enter it, and folders that never reach the place the board put them. Run:
//   node --import tsx --test tests/office-scene.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { castWithStandIns, placeOf } from '../shared/office/model'
import type { OfficePerson, OfficeSnapshot } from '../shared/office/model'
import { DemoBoard } from '../shared/office/demo'
import { FIXTURES, GOLF } from '../app/office/layout'

// ── Just enough browser for the scene ──────────────────────────────────────

function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A 2D context that accepts every call and every property and draws nothing. */
function paintNothing(): CanvasRenderingContext2D {
  const result = { width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2, addColorStop() {} }
  return new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, prop) => (prop in target ? target[prop] : () => result),
    set: (target, prop, value) => {
      target[prop] = value
      return true
    }
  }) as unknown as CanvasRenderingContext2D
}

function element(): Record<string, unknown> {
  const root = { addEventListener() {}, removeEventListener() {} }
  return {
    style: {},
    width: 300,
    height: 150,
    clientWidth: 1200,
    clientHeight: 800,
    ownerDocument: root,
    getRootNode: () => root,
    getContext: () => paintNothing(),
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    remove() {},
    setPointerCapture() {},
    releasePointerCapture() {}
  }
}

const g = globalThis as Record<string, unknown>
g.window = { devicePixelRatio: 1 }
g.document = { createElement: () => element(), createElementNS: () => element() }
g.ResizeObserver = class {
  observe() {}
  disconnect() {}
}
g.requestAnimationFrame = () => 0
g.cancelAnimationFrame = () => {}

const fakeRenderer = () => ({
  domElement: element(),
  shadowMap: {},
  setPixelRatio() {},
  setSize() {},
  render() {},
  dispose() {}
}) as unknown as THREE.WebGLRenderer

// ── What the test looks at inside the scene ────────────────────────────────

interface Floater { obj: THREE.Object3D, life: number, wall?: boolean }
interface Seen { born: number, life: number }
interface Internals {
  scene: THREE.Scene
  actors: Map<string, {
    key: string
    queued: number
    tool: string | null
    walking: boolean
    stooped: boolean
    pace: number
    rig: { root: THREE.Object3D, props: Record<string, THREE.Object3D>, handL: THREE.Object3D, handR: THREE.Object3D }
  }>
  courier: { queued: number } | null
  floaters: Floater[]
  wanderers: unknown[]
  folders: Map<string, { place: string | null }>
  cast: OfficePerson[]
  last: number
  /** The scene's own clock, which runs faster than the wall clock while a backlog builds up. */
  time: number
  tick: (now: number) => void
  pongOn: boolean
  fixtures: { pongBall: THREE.Object3D }
  golfBall: THREE.Object3D | null
}

test('a run through the demo: everyone moves once a frame, effects clear up, and every folder lands', async () => {
  Math.random = seeded(7)
  const { OfficeScene } = await import('../app/office/office')
  const { Actor } = await import('../app/office/actor')

  const updates = new Map<object, number>()
  const update = Actor.prototype.update
  Actor.prototype.update = function (this: InstanceType<typeof Actor>, dt: number) {
    updates.set(this, (updates.get(this) ?? 0) + 1)
    update.call(this, dt)
  }
  // Every chat by the machine, with how far apart the two stood when it started.
  const chats: number[] = []
  type Person = InstanceType<typeof Actor>
  const proto = OfficeScene.prototype as unknown as { chat: (a: Person, b: Person) => Promise<void> }
  const chat = proto.chat
  proto.chat = function (a, b) {
    chats.push(Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z))
    return chat.call(this, a, b)
  }

  const ticker: string[] = []
  const scene = new OfficeScene(element() as unknown as HTMLElement, { renderer: fakeRenderer, onTicker: line => ticker.push(line) })
  const s = scene as unknown as Internals
  const demo = new DemoBoard()
  let snap: OfficeSnapshot = demo.snapshot()
  scene.setSnapshot(snap)

  const frame = 1000 / 30
  let now = s.last
  let nextStep = now + 1500
  const pongXs = new Set<string>()
  let putting = 0
  let rolled = false
  let holed = false
  let ballAtTee = true
  let ballLow = false
  let floorHits = 0
  let ballSpot = { x: 0, z: 0 }
  let ballStill = 0
  let restedOnFloor = false
  const pickupGaps: number[] = []
  const walkBack: { reversals: number, ratio: number, note?: string }[] = []
  type Chase = { key: string, was: boolean, t: number, at: { x: number, z: number }, stoppedAt: number | null, flutters: number, rushedNear: number, creptFast: number, stoopFrames: number, worst?: string, note?: string }
  const chases: Chase[] = []
  let chaser: Chase | null = null
  let fetcher: { key: string, from: { x: number, z: number }, at: { x: number, z: number }, dir: { x: number, z: number } | null, reversals: number, walked: number, frames: number, note?: string } | null = null
  const strikes: { gap: number, height: number, towardHole: number, towardBall: number, handsApart: number }[] = []
  let escaped = false
  const drinks = new Set<string>()
  const seen = new Map<THREE.Object3D, Seen>()
  const run = async (ms: number, feed: boolean, until?: () => boolean) => {
    const end = now + ms
    while (now < end) {
      now += frame
      if (feed && now >= nextStep) {
        nextStep = now + 2600
        if (scene.backlog < 4) {
          snap = demo.advance()
          scene.setSnapshot(snap)
        }
      }
      updates.clear()
      s.tick(now)
      // Between two frames the browser runs whatever the last one resolved; errands are promise chains.
      await new Promise(resolve => setImmediate(resolve))

      const movers = [...s.actors.values(), ...(s.courier ? [s.courier] : [])]
      for (const mover of movers) {
        assert.equal(updates.get(mover), 1, `${(mover as { key?: string }).key} moved ${updates.get(mover) ?? 0} times in one frame`)
      }
      for (const f of s.floaters) {
        if (!seen.has(f.obj)) seen.set(f.obj, { born: now, life: f.life })
        const age = now - seen.get(f.obj)!.born
        assert.ok(age <= f.life * 1000 + 2 * frame, `an effect is still up after ${(age / 1000).toFixed(1)}s; it should last ${f.life}s`)
        // Not assert.equal: on failure it would print a diff of the whole scene graph.
        if (f.wall) assert.ok(f.obj.parent === s.scene, 'a speech bubble was made but never put in the scene')
      }
      const pong = s.fixtures.pongBall
      if (s.pongOn && pong.visible) pongXs.add(pong.position.x.toFixed(2))
      if (pong.visible) {
        const low = pong.position.y < 0.08
        if (low && !ballLow) floorHits++
        // From the first touch of the floor to the pickup, watch the one going after it.
        if (low && !chaser) {
          const at = pong.position
          const near = [...s.actors.values()].sort((x, y) => Math.hypot(x.rig.root.position.x - at.x, x.rig.root.position.z - at.z) - Math.hypot(y.rig.root.position.x - at.x, y.rig.root.position.z - at.z))[0]!
          chaser = { key: near.key, was: near.walking, t: s.time, at: { x: near.rig.root.position.x, z: near.rig.root.position.z }, stoppedAt: null, flutters: 0, rushedNear: 0, creptFast: 0, stoopFrames: 0 }
        } else if (chaser) {
          const who = s.actors.get(chaser.key)!
          const p = who.rig.root.position
          // Metres per second of the scene's own time.
          const pace = Math.hypot(p.x - chaser.at.x, p.z - chaser.at.z) / Math.max(1e-6, s.time - chaser.t)
          chaser.at = { x: p.x, z: p.z }
          chaser.t = s.time
          if (who.stooped) {
            chaser.stoopFrames++
            if (pace > 1.5) {
              chaser.creptFast++
              chaser.worst = `${pace.toFixed(2)} m/s at t=${now} walking=${who.walking} pace=${who.pace}`
            }
          } else if (Math.hypot(p.x - pong.position.x, p.z - pong.position.z) < 1.2 && pace > 2) {
            chaser.rushedNear++
          }
          // A stop of a third of a second or less between two walks is the walk cycle stuttering.
          if (who.walking && !chaser.was && chaser.stoppedAt !== null && s.time - chaser.stoppedAt < 0.35) {
            chaser.flutters++
            chaser.note = `stopped ${((s.time - chaser.stoppedAt) * 1000).toFixed(0)} ms, stooped=${who.stooped}, ${Math.hypot(p.x - pong.position.x, p.z - pong.position.z).toFixed(2)} m from the ball at y ${pong.position.y.toFixed(2)}`
          }
          if (!who.walking && chaser.was) chaser.stoppedAt = s.time
          chaser.was = who.walking
        }
        ballLow = low
        // Still for a few frames on the floor: it has come to rest, and somebody has to go and fetch it.
        const moved = Math.hypot(pong.position.x - ballSpot.x, pong.position.z - ballSpot.z)
        ballSpot = { x: pong.position.x, z: pong.position.z }
        ballStill = low && moved < 1e-4 ? ballStill + 1 : 0
        if (ballStill > 4) restedOnFloor = true
      } else {
        if (chaser) chases.push(chaser)
        chaser = null
        if (restedOnFloor) {
          // Picked up: whoever fetched it is standing at the spot.
          const spot = ballSpot
          const nearest = [...s.actors.values()].sort((x, y) => Math.hypot(x.rig.root.position.x - spot.x, x.rig.root.position.z - spot.z) - Math.hypot(y.rig.root.position.x - spot.x, y.rig.root.position.z - spot.z))[0]!
          fetcher = { key: nearest.key, from: { x: spot.x, z: spot.z }, at: { x: nearest.rig.root.position.x, z: nearest.rig.root.position.z }, dir: null, reversals: 0, walked: 0, frames: 0 }
          pickupGaps.push(Math.min(...[...s.actors.values()].map(actor => Math.hypot(actor.rig.root.position.x - spot.x, actor.rig.root.position.z - spot.z))))
        }
        ballLow = false
        ballStill = 0
        restedOnFloor = false
      }
      if (fetcher) {
        const p = s.actors.get(fetcher.key)!.rig.root.position
        const sx = p.x - fetcher.at.x
        const sz = p.z - fetcher.at.z
        const stride = Math.hypot(sx, sz)
        fetcher.walked += stride
        // Turning right round (more than 120 degrees between two strides) is the snap that looks like stuttering.
        if (stride > 1e-3) {
          if (fetcher.dir && (sx * fetcher.dir.x + sz * fetcher.dir.z) / stride < -0.5) {
            fetcher.reversals++
            fetcher.note = `${fetcher.key} turned round at (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) after ${fetcher.frames} frames; pickup at (${fetcher.from.x.toFixed(2)}, ${fetcher.from.z.toFixed(2)}), walked ${fetcher.walked.toFixed(2)} m, heading was (${fetcher.dir.x.toFixed(2)}, ${fetcher.dir.z.toFixed(2)}) now (${(sx / stride).toFixed(2)}, ${(sz / stride).toFixed(2)})`
          }
          fetcher.dir = { x: sx / stride, z: sz / stride }
        }
        fetcher.at = { x: p.x, z: p.z }
        const end = [-2.2, 2.2].map(dx => ({ x: FIXTURES.pong.x + dx, z: FIXTURES.pong.z })).find(e => Math.hypot(p.x - e.x, p.z - e.z) < 0.15)
        if (end) {
          walkBack.push({ reversals: fetcher.reversals, note: fetcher.note, ratio: fetcher.walked / Math.max(0.5, Math.hypot(fetcher.from.x - end.x, fetcher.from.z - end.z)) })
          fetcher = null
        } else if (++fetcher.frames > 30 * 20) {
          fetcher = null
        }
      }
      const putter = s.actors.get('boss')?.tool === 'putter'
      if (putter) putting++
      // A drink counts once it is carried: in hand while walking, not just sipped at the desk.
      for (const actor of s.actors.values()) {
        if (actor.tool === 'mug' || actor.tool === 'cup') drinks.add(actor.tool)
      }
      const ball = s.golfBall
      if (ball && ball.position.x > GOLF.tee.x + 0.5) rolled = true
      // The frame the ball first leaves the tee is the moment of impact.
      if (ball && putter && ballAtTee && ball.position.x > GOLF.tee.x + 0.01) {
        const boss = s.actors.get('boss')!
        boss.rig.root.updateMatrixWorld(true)
        const club = boss.rig.props.putter!
        const head = club.children[club.children.length - 1]!.getWorldPosition(new THREE.Vector3())
        const hands = boss.rig.handL.getWorldPosition(new THREE.Vector3()).distanceTo(boss.rig.handR.getWorldPosition(new THREE.Vector3()))
        const facing = { x: Math.sin(boss.rig.root.rotation.y), z: Math.cos(boss.rig.root.rotation.y) }
        const toBall = new THREE.Vector2(GOLF.tee.x - boss.rig.root.position.x, GOLF.tee.z - boss.rig.root.position.z).normalize()
        const toHole = new THREE.Vector2(GOLF.hole.x - GOLF.tee.x, GOLF.hole.z - GOLF.tee.z).normalize()
        strikes.push({
          gap: Math.hypot(head.x - GOLF.tee.x, head.z - GOLF.tee.z),
          height: head.y,
          towardHole: facing.x * toHole.x + facing.z * toHole.y,
          towardBall: facing.x * toBall.x + facing.z * toBall.y,
          handsApart: hands
        })
      }
      ballAtTee = !ball || ball.position.x <= GOLF.tee.x + 0.01
      if (ball && putter && !ball.visible && Math.abs(ball.position.x - GOLF.hole.x) < 0.01) holed = true
      if (s.wanderers.length > 0) escaped = true
      if (until?.()) return true
    }
    return false
  }

  // The scripted scenes, then the endless shuffle that follows them.
  await run(300_000, true)
  assert.ok(seen.size > 50, `only ${seen.size} bubbles and effects in five minutes`)
  assert.ok(ticker.some(line => line.startsWith('A courier brings')), 'no parcel was delivered')
  // The pastimes are part of the show, not decoration: a match is played with a moving ball, and the Boss putts.
  assert.ok(pongXs.size > 20, `no ping-pong rally in five minutes (${pongXs.size} ball positions)`)
  // A ball that gets past a player does not just stop: it bounces on the floor, and the player goes after it.
  assert.ok(floorHits >= 3, `a ball that got past a player bounced on the floor ${floorHits} times; it should bounce on and on until it stops`)
  assert.ok(pickupGaps.length > 0, 'a ball that got past a player was never picked up')
  assert.ok(chases.length > 0, 'no chase was seen from the first bounce to the pickup')
  // Up close they watch the ball and then bend over and creep; they do not run on the spot after it.
  assert.ok(chases.some(c => c.stoopFrames > 0), 'nobody ever bent over to pick the ball up')
  for (const c of chases) {
    assert.equal(c.flutters, 0, `the walk after the ball stopped and started again ${c.flutters} times within a third of a second (${c.note})`)
    assert.equal(c.rushedNear, 0, `${c.rushedNear} frames at a run within 1.2 m of the ball; they should stand and watch it first`)
    assert.equal(c.creptFast, 0, `${c.creptFast} frames bent over but moving faster than a creep (${c.worst})`)
  }
  assert.ok(walkBack.length > 0, 'nobody walked back to the table after fetching a ball')
  // Back to the table without turning round on the way, such as by way of a path node behind them.
  for (const back of walkBack) assert.equal(back.reversals, 0, `the walk back to the table doubled back ${back.reversals} times (${back.ratio.toFixed(1)} times the straight way): ${back.note}`)
  for (const gap of pickupGaps) assert.ok(gap < 0.8, `nobody was at the ball when it was picked up (${gap.toFixed(2)} m away)`)
  assert.ok(putting > 0, 'the Boss never picked up his putter')
  assert.ok(rolled, 'the golf ball never left the tee')
  assert.ok(holed, 'no putt ever dropped into the hole')
  // Over the ball the Boss stands side-on to the hole, looking at the ball, with the club head at it.
  assert.ok(strikes.length > 0, 'no putt was ever struck')
  for (const strike of strikes) {
    assert.ok(strike.gap < 0.3, `the putter head was ${strike.gap.toFixed(2)} from the ball when it was struck`)
    assert.ok(strike.height < 0.3, `the putter head was ${strike.height.toFixed(2)} off the floor when it struck the ball`)
    assert.ok(Math.abs(strike.towardHole) < 0.25, `the Boss faced the hole (${strike.towardHole.toFixed(2)}) instead of standing side-on to it`)
    assert.ok(strike.towardBall > 0.9, `the Boss was not looking at the ball (${strike.towardBall.toFixed(2)})`)
    assert.ok(strike.handsApart < 0.25, `the hands were ${strike.handsApart.toFixed(2)} apart; both belong on the club`)
  }
  assert.ok(escaped, 'no bug ever escaped the jar, so the bug scene never played')

  // Stop the board and let the office catch up: every folder ends where the board says it lies.
  const cast = castWithStandIns(snap.cast)
  const misplaced = () => snap.tasks.filter(task => s.folders.get(task.id)?.place !== placeOf(task, cast))
  const settled = await run(120_000, false, () => misplaced().length === 0 && s.folders.size === snap.tasks.length)
  assert.ok(settled, `folders never reached their places: ${JSON.stringify(misplaced().map(t => [t.title, s.folders.get(t.id)?.place ?? 'missing', placeOf(t, cast)]))}`)

  // Once the effects of the last errands have run out, nothing is left floating or crawling.
  const errandsDone = await run(60_000, false, () => s.wanderers.length === 0)
  assert.ok(errandsDone, 'an escaped bug never went back into the jar')

  // With nothing left to do, people get up for a drink, and now and then they stop for a chat.
  await run(400_000, false)
  assert.ok(drinks.has('mug'), 'nobody ever carried a coffee back from the machine')
  assert.ok(drinks.has('cup'), 'nobody ever carried a cup of water back from the cooler')
  assert.ok(chats.length > 0, 'nobody ever stopped for a chat by the coffee machine or the cooler')
  // The two face each other a step or two apart, not across the room.
  for (const gap of chats) assert.ok(gap > 0.5 && gap < 2.5, `a chat started with the two ${gap.toFixed(2)} apart`)

  Actor.prototype.update = update
  proto.chat = chat
  scene.dispose()
})

test('a hammer or a wrench rises out of the fist; it never hangs down into the desk', async () => {
  const { Actor } = await import('../app/office/actor')
  const person: OfficePerson = { userId: 'u-tool', key: 'tess', name: 'Tess', role: 'worker' }
  for (const style of ['hammer', 'wrench']) {
    const actor = new Actor(person, { x: 0, z: 0 }, 0)
    const inner = actor as unknown as { style: string, styleUntil: number }
    inner.style = style
    inner.styleUntil = 1e9
    actor.activity = 'working'
    const tool = actor.rig.props[style]!
    let lowest = 1
    for (let i = 0; i < 150; i++) {
      actor.update(1 / 30)
      if (i < 20) continue
      assert.ok(tool.visible, `${style}: not in hand at frame ${i}`)
      actor.rig.root.updateMatrixWorld(true)
      // The far end of the tool is the middle of its parts farthest from the grip (a hammer head is two blocks).
      const reach = Math.max(...tool.children.map(c => c.position.length()))
      const ends = tool.children.filter(c => c.position.length() > reach * 0.9)
      const grip = tool.getWorldPosition(new THREE.Vector3())
      const middle = ends.reduce((sum, c) => sum.add(c.getWorldPosition(new THREE.Vector3())), new THREE.Vector3()).divideScalar(ends.length)
      const dir = middle.sub(grip).normalize()
      lowest = Math.min(lowest, dir.y)
    }
    assert.ok(lowest > -0.15, `${style} points down into the desk (axis y ${lowest.toFixed(2)}); it should rise out of the hand`)
  }
})

test('the hammer head lies along the swing: the worker sees its short end, not its long side', async () => {
  const { Actor } = await import('../app/office/actor')
  const person: OfficePerson = { userId: 'u-hammer', key: 'hank', name: 'Hank', role: 'worker' }
  const actor = new Actor(person, { x: 0, z: 0 }, 0)
  const inner = actor as unknown as { style: string, styleUntil: number }
  inner.style = 'hammer'
  inner.styleUntil = 1e9
  actor.activity = 'working'
  const tool = actor.rig.props.hammer!
  let widest = 0
  for (let i = 0; i < 150; i++) {
    actor.update(1 / 30)
    if (i < 20) continue
    actor.rig.root.updateMatrixWorld(true)
    // Children: the handle, the striking face, the claw. The head runs from the claw to the face.
    const [, face, claw] = tool.children as THREE.Object3D[]
    const along = face!.getWorldPosition(new THREE.Vector3()).sub(claw!.getWorldPosition(new THREE.Vector3())).normalize()
    // The head swings through the plane the worker faces into. It never lies across their view.
    const side = new THREE.Vector3(1, 0, 0).transformDirection(actor.rig.root.matrixWorld)
    widest = Math.max(widest, Math.abs(along.dot(side)))
  }
  assert.ok(widest < 0.25, `the hammer head lies across the worker's view (${(widest * 100).toFixed(0)}% of its length sideways); its short end should face them`)
})
