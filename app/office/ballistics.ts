// A loose ball in the office: gravity, bounces off the floor, the walls and anything solid, and a roll to a
// stop. A ping-pong ball that gets past a player lives here. Pure maths on a position and a velocity, so
// it can be tested without a scene; the randomness comes in through `world.random`.
import * as THREE from 'three'

export interface Ball {
  pos: THREE.Vector3
  vel: THREE.Vector3
}

export interface BallWorld {
  /** Everything solid, as boxes. The ball bounces off their outside. */
  boxes: THREE.Box3[]
  /** The walls of the room. */
  room: { minX: number, maxX: number, minZ: number, maxZ: number }
  radius: number
  random: () => number
}

const GRAVITY = 9.8
const SUBSTEP = 1 / 120
/** Slowing down of a ball rolling along the floor, in metres per second per second. */
const ROLLING_DRAG = 1.1
const CLOSEST = new THREE.Vector3()
const NORMAL = new THREE.Vector3()

/** Moves the ball on by `dt` seconds. Returns true once it lies still on the floor. */
export function stepBall(ball: Ball, dt: number, world: BallWorld): boolean {
  const steps = Math.max(1, Math.ceil(dt / SUBSTEP))
  for (let i = 0; i < steps; i++) integrate(ball, dt / steps, world)
  return ball.pos.y <= world.radius + 1e-3 && ball.vel.lengthSq() < 1e-4
}

function integrate(ball: Ball, h: number, world: BallWorld) {
  const { pos, vel } = ball
  const r = world.radius
  const random = world.random
  vel.y -= GRAVITY * h
  pos.addScaledVector(vel, h)

  if (pos.y < r) {
    pos.y = r
    if (vel.y < -0.5) {
      // Never quite straight, and never as high as it fell: a different bounce every time.
      vel.y = -vel.y * (0.5 + random() * 0.3)
      vel.x = vel.x * 0.93 + (random() - 0.5) * 0.5
      vel.z = vel.z * 0.93 + (random() - 0.5) * 0.5
    } else {
      vel.y = 0
    }
  }
  if (pos.y <= r + 1e-4 && vel.y === 0) {
    const speed = Math.hypot(vel.x, vel.z)
    const slower = ROLLING_DRAG * h
    if (speed <= slower) {
      vel.x = 0
      vel.z = 0
    } else {
      vel.x *= (speed - slower) / speed
      vel.z *= (speed - slower) / speed
    }
  }

  const room = world.room
  const wall = () => 0.5 + random() * 0.25
  if (pos.x < room.minX + r) {
    pos.x = room.minX + r
    vel.x = Math.abs(vel.x) * wall()
  } else if (pos.x > room.maxX - r) {
    pos.x = room.maxX - r
    vel.x = -Math.abs(vel.x) * wall()
  }
  if (pos.z < room.minZ + r) {
    pos.z = room.minZ + r
    vel.z = Math.abs(vel.z) * wall()
  } else if (pos.z > room.maxZ - r) {
    pos.z = room.maxZ - r
    vel.z = -Math.abs(vel.z) * wall()
  }

  for (const box of world.boxes) {
    CLOSEST.set(
      Math.min(Math.max(pos.x, box.min.x), box.max.x),
      Math.min(Math.max(pos.y, box.min.y), box.max.y),
      Math.min(Math.max(pos.z, box.min.z), box.max.z)
    )
    NORMAL.subVectors(pos, CLOSEST)
    const distance = NORMAL.length()
    if (distance >= r) continue
    if (distance < 1e-6) {
      // Inside the box (too fast for a step): out through the top.
      NORMAL.set(0, 1, 0)
      pos.y = box.max.y + r
    } else {
      NORMAL.divideScalar(distance)
      pos.copy(CLOSEST).addScaledVector(NORMAL, r)
    }
    const into = vel.dot(NORMAL)
    if (into >= 0) continue
    if (into < -0.5 || NORMAL.y < 0.7) {
      vel.addScaledVector(NORMAL, -(1 + 0.45 + random() * 0.3) * into)
    } else {
      // Settling on top of something: it rolls along and, with nothing to carry it, rocks off the edge.
      vel.y = Math.max(vel.y, 0)
      if (Math.hypot(vel.x, vel.z) < 0.05) {
        const heading = random() * Math.PI * 2
        vel.x = Math.cos(heading) * 0.3
        vel.z = Math.sin(heading) * 0.3
      }
    }
  }
}
