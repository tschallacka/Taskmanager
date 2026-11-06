// The loose ping-pong ball: it bounces on the floor and off whatever it hits, differently every time, and
// comes to rest. Run: node --import tsx --test tests/office-ballistics.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { stepBall } from '../app/office/ballistics'
import type { Ball, BallWorld } from '../app/office/ballistics'

function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const room = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }
const world = (seed: number, boxes: THREE.Box3[] = []): BallWorld => ({ boxes, room, radius: 0.05, random: seeded(seed) })
const ball = (x: number, y: number, z: number, vx = 0, vy = 0, vz = 0): Ball => ({ pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(vx, vy, vz) })

/** Runs the ball at 30 frames a second until it rests; returns where, when, and the height at every frame. */
function play(b: Ball, w: BallWorld, seconds = 30) {
  const heights: number[] = []
  for (let t = 0; t < seconds; t += 1 / 30) {
    const rest = stepBall(b, 1 / 30, w)
    heights.push(b.pos.y)
    if (rest) return { rest: true, at: t, heights }
  }
  return { rest: false, at: seconds, heights }
}

/** How many times the ball came down onto the floor. */
function floorHits(heights: number[]): number {
  let hits = 0
  for (let i = 1; i < heights.length - 1; i++) {
    if (heights[i]! < heights[i - 1]! && heights[i]! <= heights[i + 1]! && heights[i]! < 0.08) hits++
  }
  return hits
}

test('a ball thrown past someone bounces on the floor several times, then lies still', () => {
  const b = ball(0, 1.0, 0, 3.5, 1.5, 0)
  const result = play(b, world(1))
  assert.ok(result.rest, 'the ball never came to rest')
  assert.ok(floorHits(result.heights) >= 3, `only ${floorHits(result.heights)} bounces`)
  assert.ok(b.pos.x > 2, 'the ball did not travel on')
  assert.ok(Math.abs(b.pos.y - 0.05) < 0.01, 'the ball rests off the floor')
})

test('each bounce is lower than the one before', () => {
  const b = ball(0, 1.5, 0)
  const peaks: number[] = []
  const w = world(2)
  let prevY = b.pos.y
  let rising = false
  for (let t = 0; t < 8; t += 1 / 60) {
    stepBall(b, 1 / 60, w)
    if (rising && b.pos.y < prevY) peaks.push(prevY)
    rising = b.pos.y > prevY
    prevY = b.pos.y
  }
  assert.ok(peaks.length >= 3, `${peaks.length} peaks`)
  for (let i = 1; i < peaks.length; i++) assert.ok(peaks[i]! < peaks[i - 1]!, `peak ${i} is not lower: ${peaks.join(', ')}`)
})

test('it is random: other seeds lose the ball in other places, after other numbers of bounces', () => {
  const stops = new Set<string>()
  const bounces = new Set<number>()
  for (let seed = 1; seed <= 12; seed++) {
    const b = ball(0, 1.0, 0, 3.5, 1.5, 0)
    const result = play(b, world(seed))
    stops.add(`${b.pos.x.toFixed(1)},${b.pos.z.toFixed(1)}`)
    bounces.add(floorHits(result.heights))
  }
  assert.ok(stops.size >= 8, `${stops.size} different places in 12 throws`)
  assert.ok(bounces.size >= 2, 'every throw bounced the same number of times')
})

test('it bounces off a solid thing and never gets inside it', () => {
  const desk = new THREE.Box3(new THREE.Vector3(3, 0, -1), new THREE.Vector3(5, 0.8, 1))
  const b = ball(0, 0.5, 0, 6, 0, 0)
  const w = world(3, [desk])
  let bounced = false
  for (let t = 0; t < 10; t += 1 / 30) {
    stepBall(b, 1 / 30, w)
    if (b.vel.x < 0) bounced = true
    assert.ok(!desk.containsPoint(b.pos), `the ball is inside the desk at ${b.pos.toArray().map(n => n.toFixed(2)).join(', ')}`)
  }
  assert.ok(bounced, 'the ball went through the desk or stopped dead against it')
  assert.ok(b.pos.x < 3, 'the ball did not come back from the desk')
})

test('it bounces off the walls and stays in the room', () => {
  const b = ball(0, 0.5, 0, 9, 0.5, 7)
  const w = world(4)
  for (let t = 0; t < 20; t += 1 / 30) {
    stepBall(b, 1 / 30, w)
    assert.ok(b.pos.x >= room.minX && b.pos.x <= room.maxX && b.pos.z >= room.minZ && b.pos.z <= room.maxZ, 'the ball left the room')
  }
})

test('a slow frame (a long step) does not push the ball through the floor or a thin wall', () => {
  const b = ball(0, 2, 0, 5, 0, 0)
  const wall = new THREE.Box3(new THREE.Vector3(2, 0, -5), new THREE.Vector3(2.05, 3, 5))
  const w = world(5, [wall])
  for (let i = 0; i < 100; i++) {
    stepBall(b, 0.1, w)
    assert.ok(b.pos.y >= 0.05 - 1e-9, 'the ball sank into the floor')
    assert.ok(b.pos.x < 2.05 + 0.06, 'the ball tunnelled through the wall')
  }
})
