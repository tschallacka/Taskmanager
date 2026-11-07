// Tests for the walk's corners: a sharp turn on a path is cut into two gentler turns, a gentle path is left as it is.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { roundSharpCorners } from '../app/office/actor'
import type { P } from '../app/office/layout'

// The angle, in degrees, between the leg into a point and the leg out of it (0 = straight on, 180 = straight back).
function turnDegrees(a: P, b: P, c: P): number {
  const ax = b.x - a.x
  const az = b.z - a.z
  const bx = c.x - b.x
  const bz = c.z - b.z
  const cos = (ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz))
  return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI
}

test('a straight path, or one that bends gently, is left exactly as it is', () => {
  const straight: P[] = [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 4, z: 0 }]
  assert.deepEqual(roundSharpCorners(straight), straight)
  const gentle: P[] = [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 3, z: 1.5 }]
  assert.deepEqual(roundSharpCorners(gentle), gentle)
})

test('a turn back of about 120 degrees at a node is cut into two turns of about 60 degrees each', () => {
  // North along z, then back south-west: the walk the demo took round the pong table.
  const path: P[] = [{ x: 0, z: 0 }, { x: 0, z: 5.7 }, { x: -1.9, z: 4.6 }]
  const rounded = roundSharpCorners(path)
  assert.ok(rounded.length > path.length, 'the corner gains points')
  for (let i = 1; i < rounded.length - 1; i++) {
    assert.ok(turnDegrees(rounded[i - 1]!, rounded[i]!, rounded[i + 1]!) < 90, `turn at point ${i} is under 90 degrees`)
  }
  assert.deepEqual(rounded[0], path[0], 'the start is kept')
  assert.deepEqual(rounded[rounded.length - 1], path[path.length - 1], 'the end is kept')
})

test('the cut is never longer than half of either leg, so a short leg is not overshot', () => {
  const path: P[] = [{ x: 0, z: 0 }, { x: 0, z: 0.4 }, { x: -0.6, z: 0.1 }]
  const rounded = roundSharpCorners(path, 0.6)
  for (const point of rounded) {
    assert.ok(point.z >= -1e-9 && point.z <= 0.4 + 1e-9, `point ${point.x},${point.z} stays on the legs`)
  }
  assert.ok(rounded.length >= path.length)
})

test('a path of one or two points is returned as a copy', () => {
  const one: P[] = [{ x: 1, z: 1 }]
  const copy = roundSharpCorners(one)
  assert.deepEqual(copy, one)
  assert.notEqual(copy, one)
})
