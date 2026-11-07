// Everything the office is built from, out of plain three.js shapes: no model files to load.
import * as THREE from 'three'
import type { Desk, P3 } from './layout'
import { BOSS_ROOM, DELIVERY_DOOR_Z, FIXTURES, GOLF, ROOM } from './layout'
import { FIGURES } from './figures'

const materials = new Map<string, THREE.MeshStandardMaterial>()

export function mat(color: string, extra: { emissive?: string, rough?: number, metal?: number, opacity?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${extra.emissive ?? ''}|${extra.rough ?? ''}|${extra.metal ?? ''}|${extra.opacity ?? ''}`
  let m = materials.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: extra.rough ?? 0.75,
      metalness: extra.metal ?? 0.05,
      emissive: new THREE.Color(extra.emissive ?? '#000000'),
      transparent: extra.opacity !== undefined,
      opacity: extra.opacity ?? 1
    })
    materials.set(key, m)
  }
  return m
}

export function box(w: number, h: number, d: number, color: string | THREE.Material, at: Partial<P3> = {}): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'string' ? mat(color) : color)
  mesh.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

export function cyl(rTop: number, rBottom: number, h: number, color: string | THREE.Material, at: Partial<P3> = {}, segments = 16): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), typeof color === 'string' ? mat(color) : color)
  mesh.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

export function ball(r: number, color: string | THREE.Material, at: Partial<P3> = {}): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), typeof color === 'string' ? mat(color) : color)
  mesh.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  mesh.castShadow = true
  return mesh
}

function capsule(r: number, len: number, color: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat(color))
  mesh.castShadow = true
  return mesh
}

// ── Text ────────────────────────────────────────────────────────────────────

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!]
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** A camera-facing tag: a name over a head, an emoji in a bubble. `height` is in world units. */
export function textSprite(text: string, opts: { bg?: string, fg?: string, height?: number, font?: string, border?: string } = {}): THREE.Sprite {
  const font = opts.font ?? '600 44px system-ui, sans-serif'
  const [, probe] = canvas(4, 4)
  probe.font = font
  const w = Math.ceil(probe.measureText(text).width) + 36
  const [c, ctx] = canvas(Math.max(w, 64), 64)
  if (opts.bg) {
    ctx.fillStyle = opts.bg
    roundRect(ctx, 2, 2, c.width - 4, 60, 22)
    ctx.fill()
    if (opts.border) {
      ctx.strokeStyle = opts.border
      ctx.lineWidth = 3
      ctx.stroke()
    }
  }
  ctx.font = font
  ctx.fillStyle = opts.fg ?? '#1d1d1f'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, c.width / 2, 34)
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false, transparent: true }))
  const height = opts.height ?? 0.45
  sprite.scale.set(height * c.width / 64, height, 1)
  sprite.renderOrder = 10
  return sprite
}

/** A flat sign: tray labels, the fixtures' names. */
export function signPlane(text: string, w: number, h: number, bg: string, fg: string): THREE.Mesh {
  const scale = 128
  const [c, ctx] = canvas(Math.round(w * scale), Math.round(h * scale))
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.fillStyle = fg
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let size = Math.round(c.height * 0.62)
  ctx.font = `800 ${size}px system-ui, sans-serif`
  while (ctx.measureText(text).width > c.width * 0.9 && size > 8) {
    size -= 2
    ctx.font = `800 ${size}px system-ui, sans-serif`
  }
  ctx.fillText(text, c.width / 2, c.height / 2 + 2)
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }))
}

/** A canvas painted onto a plane: monitors and the whiteboard redraw it while the scene runs. */
export interface Painted {
  mesh: THREE.Mesh
  ctx: CanvasRenderingContext2D
  texture: THREE.CanvasTexture
  w: number
  h: number
}

export function paintedPlane(w: number, h: number, px: number, glow = false): Painted {
  const [c, ctx] = canvas(px, Math.round(px * h / w))
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = glow
    ? new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
    : new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6 })
  return { mesh: new THREE.Mesh(new THREE.PlaneGeometry(w, h), material), ctx, texture, w: c.width, h: c.height }
}

// ── Looks ───────────────────────────────────────────────────────────────────

export interface Look {
  shirt: string
  pants: string
  skin: string
  hair: string
  headwear: 'none' | 'ponytail' | 'spiky' | 'hardhat' | 'beanie' | 'headphones' | 'bun' | 'cap' | 'bald' | 'curly'
  glasses?: 'round' | 'shades'
  tie?: string
  capColor?: string
}

const LOOKS: Record<string, Look> = {
  pia: { shirt: '#e2557a', pants: '#2d3142', skin: '#f1c27d', hair: '#6b3420', headwear: 'ponytail', glasses: 'round' },
  wren: { shirt: '#3fa7d6', pants: '#33415c', skin: '#ffdbac', hair: '#f2c14e', headwear: 'spiky' },
  wick: { shirt: '#f78154', pants: '#3d405b', skin: '#c68642', hair: '#2b2118', headwear: 'hardhat' },
  wynn: { shirt: '#59cd90', pants: '#264653', skin: '#e0ac69', hair: '#3a2618', headwear: 'beanie' },
  wade: { shirt: '#9b5de5', pants: '#22223b', skin: '#8d5524', hair: '#111111', headwear: 'headphones' },
  usher: { shirt: '#00bbf9', pants: '#495057', skin: '#f1c27d', hair: '#8a5a44', headwear: 'curly', glasses: 'round' },
  nina: { shirt: '#d62828', pants: '#1d3557', skin: '#ffdbac', hair: '#2f1b10', headwear: 'bun', glasses: 'round' },
  quincy: { shirt: '#fee440', pants: '#3a5a40', skin: '#c68642', hair: '#1b1b1b', headwear: 'cap' },
  boss: { shirt: '#2b2d42', pants: '#2b2d42', skin: '#e0ac69', hair: '#5c5c5c', headwear: 'bald', glasses: 'shades', tie: '#c1121f' },
  courier: { shirt: '#9c6644', pants: '#582f0e', skin: '#ffdbac', hair: '#2b2118', headwear: 'cap', capColor: '#7f5539', glasses: 'shades' }
}
function hashOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

export function hueColor(text: string, s = 0.62, l = 0.55): string {
  return `#${new THREE.Color().setHSL((hashOf(text) % 360) / 360, s, l).getHexString()}`
}

export function lookOf(key: string): Look {
  if (LOOKS[key]) return LOOKS[key]
  if (FIGURES[key]) return FIGURES[key]
  const h = hashOf(key)
  const skins = ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524']
  const hairs = ['#2b2118', '#6b3420', '#f2c14e', '#111111', '#a0522d']
  const wear: Look['headwear'][] = ['none', 'spiky', 'beanie', 'cap', 'curly']
  return { shirt: hueColor(key), pants: '#343a40', skin: skins[h % 5]!, hair: hairs[(h >>> 3) % 5]!, headwear: wear[(h >>> 6) % 5]! }
}

/** Dark ink on a light background, white on a dark one. */
export function inkOn(bg: string): string {
  return new THREE.Color(bg).getHSL({ h: 0, s: 0, l: 0 }).l > 0.6 ? '#212529' : '#ffffff'
}

// ── People ──────────────────────────────────────────────────────────────────

export interface Rig {
  root: THREE.Group
  body: THREE.Group
  torso: THREE.Group
  head: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
  legL: THREE.Group
  legR: THREE.Group
  handR: THREE.Group
  handL: THREE.Group
  carry: THREE.Group
  /** Things a person may hold: shown one at a time by the actor. */
  props: Record<string, THREE.Object3D>
}

function limb(r: number, len: number, color: string, endColor: string, endR: number): THREE.Group {
  const pivot = new THREE.Group()
  const part = capsule(r, len, color)
  part.position.y = -len / 2 - r * 0.4
  pivot.add(part)
  const end = ball(endR, endColor, { y: -len - r * 1.2 })
  pivot.add(end)
  return pivot
}

export function buildPerson(key: string, back?: string): Rig {
  const look = lookOf(key)
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)

  const legL = limb(0.12, 0.55, look.pants, '#222', 0.13)
  const legR = limb(0.12, 0.55, look.pants, '#222', 0.13)
  legL.position.set(-0.16, 0.92, 0)
  legR.position.set(0.16, 0.92, 0)
  body.add(legL, legR)

  const torso = new THREE.Group()
  torso.position.y = 0.92
  body.add(torso)
  const chest = capsule(0.31, 0.42, look.shirt)
  chest.position.y = 0.42
  chest.scale.set(1, 1, 0.8)
  torso.add(chest)
  if (look.tie) {
    const tie = box(0.1, 0.42, 0.04, look.tie, { y: 0.48, z: 0.26 })
    torso.add(tie)
  }
  // The role, printed across the back of the shirt: BOSS, WORKER, UX …
  if (back) {
    const print = signPlane(back, 0.5, 0.17, look.shirt, inkOn(look.shirt))
    // Across the shoulder blades, where the chest capsule starts to round off towards the shoulders.
    print.position.set(0, 0.7, -0.26)
    print.rotation.y = Math.PI
    torso.add(print)
  }

  const head = new THREE.Group()
  head.position.y = 1.0
  torso.add(head)
  head.add(ball(0.3, look.skin, { y: 0.18 }))
  for (const side of [-1, 1]) {
    head.add(ball(0.045, '#1b1b1b', { x: side * 0.11, y: 0.23, z: 0.26 }))
  }
  head.add(box(0.12, 0.025, 0.02, '#7a3b2e', { y: 0.08, z: 0.28 }))

  const hair = mat(look.hair)
  const cap = (color: string, y = 0.3) => {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.315, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), typeof color === 'string' ? mat(color) : color)
    dome.position.y = y - 0.12
    dome.castShadow = true
    return dome
  }
  switch (look.headwear) {
    case 'ponytail': {
      const dome = cap(look.hair)
      head.add(dome)
      const tail = capsule(0.09, 0.32, look.hair)
      tail.position.set(0, 0.12, -0.33)
      tail.rotation.x = 0.5
      head.add(tail)
      break
    }
    case 'spiky':
      for (let i = 0; i < 7; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 6), hair)
        const a = (i / 7) * Math.PI * 2
        spike.position.set(Math.cos(a) * 0.14, 0.45, Math.sin(a) * 0.14)
        spike.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5)
        head.add(spike)
      }
      break
    case 'hardhat': {
      head.add(cap('#ffc300', 0.34))
      const brim = cyl(0.4, 0.4, 0.04, '#ffc300', { y: 0.24 })
      head.add(brim)
      break
    }
    case 'beanie': {
      head.add(cap('#7b2cbf', 0.34))
      head.add(ball(0.08, '#ffffff', { y: 0.52 }))
      break
    }
    case 'headphones': {
      head.add(cap(look.hair, 0.3))
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.035, 8, 20, Math.PI), mat('#222'))
      band.position.y = 0.2
      head.add(band)
      for (const side of [-1, 1]) head.add(cyl(0.11, 0.11, 0.08, '#e63946', { x: side * 0.33, y: 0.18 }).rotateZ(Math.PI / 2))
      break
    }
    case 'bun': {
      head.add(cap(look.hair))
      head.add(ball(0.13, look.hair, { y: 0.5, z: -0.08 }))
      break
    }
    case 'cap': {
      const capColor = look.capColor ?? '#1d3557'
      head.add(cap(capColor, 0.32))
      head.add(box(0.36, 0.03, 0.26, capColor, { y: 0.22, z: 0.3 }))
      break
    }
    case 'curly':
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2
        head.add(ball(0.12, look.hair, { x: Math.cos(a) * 0.2, y: 0.4, z: Math.sin(a) * 0.2 }))
      }
      break
    case 'bald':
      head.add(ball(0.08, look.hair, { x: -0.29, y: 0.18 }))
      head.add(ball(0.08, look.hair, { x: 0.29, y: 0.18 }))
      break
    default:
      head.add(cap(look.hair))
  }
  if (look.glasses === 'round') {
    for (const side of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.015, 6, 16), mat('#222'))
      ring.position.set(side * 0.11, 0.23, 0.29)
      head.add(ring)
    }
  } else if (look.glasses === 'shades') {
    head.add(box(0.36, 0.08, 0.04, '#111', { y: 0.24, z: 0.29 }))
  }

  const armL = limb(0.085, 0.42, look.shirt, look.skin, 0.1)
  const armR = limb(0.085, 0.42, look.shirt, look.skin, 0.1)
  armL.position.set(-0.4, 0.72, 0)
  armR.position.set(0.4, 0.72, 0)
  torso.add(armL, armR)
  const handR = new THREE.Group()
  handR.position.y = -0.58
  armR.add(handR)
  const handL = new THREE.Group()
  handL.position.y = -0.58
  armL.add(handL)

  const carry = new THREE.Group()
  carry.position.set(0, 0.45, 0.55)
  torso.add(carry)

  const props: Record<string, THREE.Object3D> = {
    hammer: hammer(),
    pen: pen(),
    magnifier: magnifier(),
    stamp: stamp(),
    mug: mug(),
    wrench: wrench(),
    phone: phone(),
    paddle: paddle(),
    putter: putter(),
    cup: cup()
  }
  const leftHanded = new Set(['mug', 'cup', 'phone'])
  for (const [name, prop] of Object.entries(props)) {
    prop.visible = false
    ;(leftHanded.has(name) ? handL : handR).add(prop)
  }

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true
  })
  return { root, body, torso, head, armL, armR, legL, legR, handR, handL, carry, props }
}

function hammer(): THREE.Group {
  const g = new THREE.Group()
  g.add(cyl(0.03, 0.03, 0.55, '#8b5a2b', { y: -0.2 }))
  // The head lies along the swing (z), not across it: the worker looks at its short end, a thick striking
  // face in front and a slimmer claw behind.
  const steel = mat('#adb5bd', { metal: 0.7, rough: 0.3 })
  g.add(box(0.12, 0.12, 0.17, steel, { y: -0.45, z: 0.065 }), box(0.07, 0.08, 0.15, steel, { y: -0.45, z: -0.12 }))
  // Gripped with the head up and a little cocked back: the arm is raised forward, so it rises out of the fist.
  g.rotation.x = -0.6
  return g
}

function pen(): THREE.Group {
  const g = new THREE.Group()
  g.add(cyl(0.025, 0.025, 0.3, '#d62828', { y: -0.1 }))
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 8), mat('#222'))
  tip.position.y = -0.28
  tip.rotation.x = Math.PI
  g.add(tip)
  g.rotation.x = Math.PI / 2
  return g
}

function magnifier(): THREE.Group {
  const g = new THREE.Group()
  g.add(cyl(0.03, 0.03, 0.3, '#5c3d2e', { y: -0.1 }))
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.03, 8, 24), mat('#c9a227', { metal: 0.8, rough: 0.3 }))
  ring.position.y = -0.42
  g.add(ring)
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24), new THREE.MeshStandardMaterial({ color: '#bde0fe', transparent: true, opacity: 0.45 }))
  glass.position.y = -0.42
  g.add(glass)
  g.rotation.x = Math.PI / 2
  return g
}

function stamp(): THREE.Group {
  const g = new THREE.Group()
  g.add(ball(0.09, '#6a040f', { y: -0.05 }))
  g.add(cyl(0.035, 0.035, 0.2, '#6a040f', { y: -0.18 }))
  g.add(box(0.26, 0.08, 0.18, '#370617', { y: -0.32 }))
  return g
}

function mug(): THREE.Group {
  const g = new THREE.Group()
  g.add(cyl(0.09, 0.08, 0.18, '#ffffff', { y: -0.05, z: 0.08 }))
  g.add(cyl(0.08, 0.08, 0.01, '#4a2c2a', { y: 0.035, z: 0.08 }))
  return g
}

/** A paper cup of water from the cooler. */
function cup(): THREE.Group {
  const g = new THREE.Group()
  g.add(cyl(0.07, 0.05, 0.16, '#f1faee', { y: -0.05, z: 0.08 }))
  g.add(cyl(0.065, 0.065, 0.01, '#90e0ef', { y: 0.025, z: 0.08 }))
  return g
}

function phone(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(0.13, 0.025, 0.24, '#1b1b1e', { y: -0.04, z: 0.08 }))
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.2), new THREE.MeshBasicMaterial({ color: '#7bdff2', toneMapped: false }))
  screen.rotation.x = -Math.PI / 2
  screen.position.set(0, -0.026, 0.08)
  screen.rotation.y = Math.PI
  g.add(screen)
  g.rotation.x = -0.6
  return g
}

/** A putter, held so the shaft runs down from the hand to the head on the floor. */
function putter(): THREE.Group {
  const g = new THREE.Group()
  g.add(cyl(0.035, 0.035, 0.16, '#1b1b1e', { y: -0.04 }))
  g.add(cyl(0.015, 0.015, 0.8, mat('#ced4da', { metal: 0.8, rough: 0.25 }), { y: -0.5 }))
  g.add(box(0.07, 0.06, 0.24, mat('#495057', { metal: 0.7, rough: 0.3 }), { y: -0.9, z: 0.06 }))
  return g
}

function paddle(): THREE.Group {
  const g = new THREE.Group()
  g.add(cyl(0.025, 0.025, 0.14, '#8b5a2b', { y: -0.05 }))
  const face = cyl(0.15, 0.15, 0.025, '#d00000', { y: -0.25 }, 20)
  face.rotation.x = Math.PI / 2
  g.add(face)
  return g
}

function wrench(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(0.06, 0.5, 0.03, mat('#adb5bd', { metal: 0.8, rough: 0.3 }), { y: -0.25 }))
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.03, 6, 12, Math.PI * 1.5), mat('#adb5bd', { metal: 0.8, rough: 0.3 })).translateY(-0.52))
  // Gripped with the jaw up: the arm is raised forward, so the tool rises out of the fist.
  g.rotation.x = -Math.PI / 2
  return g
}

// ── Folders ─────────────────────────────────────────────────────────────────

/** The courier's box: cardboard, taped shut, with the board's name scrawled on the label. Sits on its own base. */
export function buildParcel(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(0.9, 0.56, 0.7, '#c9a26b', { y: 0.28 }))
  g.add(box(0.92, 0.012, 0.16, '#d9c38f', { y: 0.566 }))
  g.add(box(0.16, 0.57, 0.712, '#d9c38f', { y: 0.285 }))
  const label = signPlane('TASKS ▲ THIS WAY UP', 0.6, 0.16, '#fefae0', '#6c584c')
  label.position.set(0.2, 0.3, 0.352)
  g.add(label)
  return g
}

export function buildFolder(id: string): THREE.Group {
  const g = new THREE.Group()
  const color = hueColor(id, 0.7, 0.58)
  g.add(box(0.72, 0.06, 0.52, color))
  g.add(box(0.22, 0.062, 0.1, color, { x: -0.18, y: 0, z: -0.29 }))
  g.add(box(0.64, 0.016, 0.44, '#fafafa', { y: 0.038, z: 0.01 }))
  g.userData.folderId = id
  g.traverse((o) => {
    o.userData.folderId = id
  })
  return g
}

// ── Furniture ───────────────────────────────────────────────────────────────

function chair(color: string): THREE.Group {
  const g = new THREE.Group()
  g.add(cyl(0.05, 0.05, 0.45, '#444', { y: 0.25 }))
  g.add(cyl(0.3, 0.3, 0.03, '#333', { y: 0.03 }))
  g.add(box(0.62, 0.1, 0.58, color, { y: 0.52 }))
  g.add(box(0.6, 0.7, 0.1, color, { y: 0.95, z: 0.3 }))
  return g
}

function tray(label: string, color: string): THREE.Group {
  const g = new THREE.Group()
  g.add(box(0.9, 0.04, 0.66, '#555b6e'))
  g.add(box(0.9, 0.14, 0.03, '#555b6e', { y: 0.07, z: 0.32 }))
  g.add(box(0.9, 0.14, 0.03, '#555b6e', { y: 0.07, z: -0.32 }))
  g.add(box(0.03, 0.14, 0.66, '#555b6e', { x: 0.44, y: 0.07 }))
  g.add(box(0.03, 0.14, 0.66, '#555b6e', { x: -0.44, y: 0.07 }))
  // Labelled front and back, so it reads whichever way the tray is turned.
  for (const side of [1, -1]) {
    const sign = signPlane(label, 0.86, 0.14, color, '#ffffff')
    sign.position.set(0, 0.075, side * 0.337)
    if (side < 0) sign.rotation.y = Math.PI
    g.add(sign)
  }
  return g
}

export interface DeskParts {
  group: THREE.Group
  screen: Painted
  monitor: THREE.Group
  chair: THREE.Group
  /** The Boss's office only: the ball on the putting green. */
  golfBall?: THREE.Mesh
}

function monitorWith(screen: Painted): THREE.Group {
  const g = new THREE.Group()
  g.add(box(1.2, 0.78, 0.06, '#1b1b1e', { y: 0.55 }))
  screen.mesh.position.set(0, 0.55, 0.035)
  g.add(screen.mesh)
  g.add(cyl(0.05, 0.05, 0.3, '#1b1b1e', { y: 0.15 }))
  g.add(box(0.4, 0.03, 0.25, '#1b1b1e', { y: 0.015 }))
  return g
}

/** A cubicle: three partitions, a desk, a monitor, a chair, a tray at the opening and a name plate. */
export function buildCubicle(desk: Desk, name: string, trayLabel: string, title?: { text: string, color: string }, flair: string[] = []): DeskParts {
  const group = new THREE.Group()
  group.position.set(desk.center.x, 0, desk.center.z)
  // Built facing the back wall (row A); row B turns it round.
  const turn = desk.kind === 'row-b' ? Math.PI : 0
  group.rotation.y = turn
  const fabric = desk.kind === 'row-b' ? '#8d99ae' : '#7f9cb0'
  group.add(box(4.6, 1.6, 0.12, fabric, { y: 0.8, z: -1.1 }))
  group.add(box(0.12, 1.6, 3.3, fabric, { x: -2.3, y: 0.8, z: 0.55 }))
  group.add(box(0.12, 1.6, 3.3, fabric, { x: 2.3, y: 0.8, z: 0.55 }))
  for (const x of [-2.3, 2.3]) group.add(box(0.16, 0.06, 3.3, '#5c677d', { x, y: 1.62, z: 0.55 }))
  group.add(box(4.6, 0.06, 0.16, '#5c677d', { y: 1.62, z: -1.1 }))

  group.add(box(3.6, 0.08, 1.2, '#c8a27a', { y: 0.76 }))
  for (const x of [-1.7, 1.7]) group.add(box(0.08, 0.72, 1.1, '#9c7a5b', { x, y: 0.36 }))
  group.add(box(1.0, 0.04, 0.32, '#2b2d42', { y: 0.82, z: 0.3 }))
  group.add(box(0.12, 0.04, 0.18, '#ddd', { x: 0.75, y: 0.82, z: 0.32 }))

  const screen = paintedPlane(1.1, 0.68, 192, true)
  const monitor = monitorWith(screen)
  monitor.position.set(0, 0.8, -0.3)
  monitor.rotation.y = 0
  group.add(monitor)

  // Turned so the screen faces whoever sits there (+z in the cubicle's own frame).
  const seat = chair(desk.kind === 'row-b' ? '#3a506b' : '#284b63')
  seat.position.set(0, 0, 1.4)
  group.add(seat)

  const trayColor = trayLabel === 'TODO' ? '#2a9d8f' : '#e76f51'
  const t = tray(trayLabel, trayColor)
  // The tray stands on a little pedestal at the opening corner, where a passer-by can reach it.
  const pedestal = box(0.5, 0.88, 0.5, '#5c677d', { x: 1.7, y: 0.44, z: 2.2 })
  group.add(pedestal)
  t.position.set(1.7, 0.9, 2.2)
  t.rotation.y = Math.PI
  group.add(t)

  const plate = signPlane(name, 1.6, 0.3, '#f8f9fa', '#212529')
  plate.position.set(-1.0, 1.25, 2.21)
  plate.rotation.y = Math.PI
  const plateBack = plate.clone()
  plateBack.position.set(-2.37, 1.25, 1.6)
  plateBack.rotation.y = -Math.PI / 2
  group.add(plateBack)

  // A reviewer's cubicle says whose it is and what they do, like Pia's desk, on the outside of the back
  // partition: in row B that side faces the room.
  if (title) {
    const sign = signPlane(title.text, 3.6, 0.42, title.color, inkOn(title.color))
    sign.position.set(0, 1.2, -1.17)
    sign.rotation.y = Math.PI
    group.add(sign)
  }

  const plant = new THREE.Group()
  plant.add(cyl(0.12, 0.09, 0.2, '#bc6c25', { y: 0.1 }))
  plant.add(ball(0.18, '#2d6a4f', { y: 0.32 }))
  plant.position.set(-1.4, 0.8, -0.3)
  group.add(plant)
  // The owner's own things, either side of the monitor.
  flair.slice(0, 2).forEach((kind, i) => {
    const item = buildFlair(kind, name)
    item.position.set(i === 0 ? 1.2 : -0.9, 0.8, i === 0 ? -0.2 : -0.3)
    group.add(item)
  })
  return { group, screen, monitor, chair: seat }
}

export function buildPiaDesk(desk: Desk, flair: string[] = []): DeskParts {
  const group = new THREE.Group()
  group.position.set(desk.center.x, 0, desk.center.z)
  group.add(box(4.4, 0.1, 1.5, '#e9c46a', { y: 0.76 }))
  group.add(box(4.4, 0.7, 0.08, '#d4a373', { y: 0.38, z: 0.7 }))
  for (const x of [-2.1, 2.1]) group.add(box(0.1, 0.72, 1.4, '#d4a373', { x, y: 0.36 }))
  const front = signPlane('PIA · PROJECT MANAGER', 3.2, 0.36, '#e2557a', '#ffffff')
  front.position.set(0, 0.42, 0.745)
  group.add(front)

  const backlog = tray('BACKLOG', '#457b9d')
  backlog.position.set(-1.5, 0.81, 0.3)
  group.add(backlog)
  const verify = tray('VERIFY PM', '#e76f51')
  verify.position.set(1.5, 0.81, 0.3)
  group.add(verify)

  const screen = paintedPlane(1.1, 0.68, 192, true)
  const monitor = monitorWith(screen)
  monitor.position.set(0, 0.81, -0.1)
  monitor.rotation.y = Math.PI
  group.add(monitor)
  // The screen faces Pia, who sits on the -z side.
  const seat = chair('#9d0208')
  seat.position.set(0, 0, -1.3)
  seat.rotation.y = Math.PI
  group.add(seat)
  // Her own things on her side of the desk, either side of the monitor.
  flair.slice(0, 2).forEach((kind, i) => {
    const item = buildFlair(kind, 'pia')
    item.scale.setScalar(1.5)
    item.position.set(i === 0 ? -0.8 : 0.8, 0.81, -0.45)
    item.rotation.y = Math.PI
    group.add(item)
  })
  return { group, screen, monitor, chair: seat }
}

export function buildBossOffice(desk: Desk, flair: string[] = [], owner = ''): DeskParts {
  const group = new THREE.Group()
  const r = BOSS_ROOM
  const glass = new THREE.MeshStandardMaterial({ color: '#a8dadc', transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0.1 })
  const frame = '#495057'
  const wall = (x1: number, z1: number, x2: number, z2: number) => {
    const len = Math.hypot(x2 - x1, z2 - z1)
    const pane = new THREE.Mesh(new THREE.BoxGeometry(len, 2.4, 0.05), glass)
    pane.position.set((x1 + x2) / 2, 1.2, (z1 + z2) / 2)
    pane.rotation.y = -Math.atan2(z2 - z1, x2 - x1)
    group.add(pane)
    const rail = box(len, 0.08, 0.1, frame, { x: (x1 + x2) / 2, y: 2.42, z: (z1 + z2) / 2 })
    rail.rotation.y = pane.rotation.y
    group.add(rail)
  }
  wall(r.minX, r.minZ, r.maxX, r.minZ)
  wall(r.maxX, r.minZ, r.maxX, r.maxZ)
  wall(r.minX, r.maxZ, r.maxX, r.maxZ)
  wall(r.minX, r.minZ, r.minX, r.doorMinZ)
  wall(r.minX, r.doorMaxZ, r.minX, r.maxZ)
  const sign = signPlane('BOSS · VERIFY', 2.2, 0.4, '#2b2d42', '#ffd166')
  sign.position.set(r.minX - 0.04, 2.0, (r.minZ + r.doorMinZ) / 2)
  sign.rotation.y = -Math.PI / 2
  group.add(sign)
  group.add(box(r.maxX - r.minX - 0.2, 0.02, r.maxZ - r.minZ - 0.2, '#6d597a', { x: (r.minX + r.maxX) / 2, y: 0.011, z: (r.minZ + r.maxZ) / 2 }))

  const deskGroup = new THREE.Group()
  deskGroup.position.set(desk.center.x, 0, desk.center.z)
  deskGroup.add(box(1.6, 0.1, 3.6, '#5e3023', { y: 0.78 }))
  deskGroup.add(box(1.5, 0.74, 0.1, '#432818', { y: 0.37, z: 1.7 }))
  deskGroup.add(box(1.5, 0.74, 0.1, '#432818', { y: 0.37, z: -1.7 }))
  deskGroup.add(box(0.1, 0.7, 3.4, '#432818', { x: -0.75, y: 0.37 }))
  group.add(deskGroup)

  const inbox = tray('VERIFY', '#ffb703')
  inbox.position.set(desk.tray.x, 0.83, desk.tray.z)
  inbox.rotation.y = -Math.PI / 2
  group.add(inbox)

  const screen = paintedPlane(1.1, 0.68, 192, true)
  const monitor = monitorWith(screen)
  monitor.position.set(desk.center.x - 0.2, 0.83, desk.center.z + 0.9)
  // His own things on the desk: a nameplate facing visitors, a golf trophy by the monitor.
  const [plateKind, trophyKind] = flair
  if (plateKind) {
    const item = buildFlair(plateKind, owner)
    item.position.set(-0.55, 0.83, -0.1)
    item.rotation.y = -Math.PI / 2
    deskGroup.add(item)
  }
  if (trophyKind) {
    const item = buildFlair(trophyKind, owner)
    item.scale.setScalar(1.6)
    item.position.set(0.25, 0.83, -0.6)
    item.rotation.y = Math.PI / 2
    deskGroup.add(item)
  }
  monitor.rotation.y = Math.PI / 2
  group.add(monitor)

  const seat = chair('#3c1518')
  seat.scale.set(1.25, 1.25, 1.25)
  seat.position.set(desk.seat.x, 0, desk.seat.z)
  seat.rotation.y = Math.PI / 2
  group.add(seat)

  // Executive necessities: a putting green and a very large plant.
  const green = box(2.6, 0.03, 1.0, '#52b788', { x: 11.5, y: 0.03, z: -2.8 })
  group.add(green)
  group.add(cyl(0.07, 0.07, 0.02, '#111', { x: 12.5, y: 0.05, z: -2.8 }))
  const flag = box(0.02, 0.8, 0.02, '#eee', { x: 12.5, y: 0.45, z: -2.8 })
  group.add(flag)
  group.add(box(0.25, 0.15, 0.01, '#d00000', { x: 12.62, y: 0.78, z: -2.8 }))
  const bigPlant = new THREE.Group()
  bigPlant.add(cyl(0.35, 0.28, 0.6, '#6c584c', { y: 0.3 }))
  for (let i = 0; i < 6; i++) bigPlant.add(ball(0.4, '#2d6a4f', { x: Math.cos(i) * 0.3, y: 1.0 + (i % 3) * 0.35, z: Math.sin(i) * 0.3 }))
  bigPlant.position.set(15.8, 0, 6.2)
  group.add(bigPlant)
  // The Boss's golf ball rests on the tee at the near end of the green until he plays.
  const golfBall = ball(0.05, '#ffffff', { x: GOLF.tee.x, y: 0.095, z: GOLF.tee.z })
  golfBall.castShadow = true
  group.add(golfBall)
  return { group, screen, monitor, chair: seat, golfBall }
}

// ── The room ────────────────────────────────────────────────────────────────

function carpet(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256)
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#7d8597' : '#737b8c'
      ctx.fillRect(x * 64, y * 64, 64, 64)
    }
  }
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(9, 7)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export interface Room {
  group: THREE.Group
  whiteboard: Painted
  clockHands: { hour: THREE.Object3D, minute: THREE.Object3D }
}

export function buildRoom(): Room {
  const group = new THREE.Group()
  const w = ROOM.maxX - ROOM.minX
  const d = ROOM.maxZ - ROOM.minZ
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: carpet(), roughness: 1 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.set((ROOM.minX + ROOM.maxX) / 2, 0, (ROOM.minZ + ROOM.maxZ) / 2)
  floor.receiveShadow = true
  group.add(floor)
  // A thick slab under the floor so the cut-away edges read as a building, not a sheet of paper.
  group.add(box(w + 0.6, 0.6, d + 0.6, '#3d405b', { x: floor.position.x, y: -0.31, z: floor.position.z }))

  const wallColor = '#f1e9da'
  group.add(box(w, ROOM.height, 0.3, wallColor, { x: floor.position.x, y: ROOM.height / 2, z: ROOM.minZ - 0.15 }))
  group.add(box(0.3, ROOM.height, d, wallColor, { x: ROOM.minX - 0.15, y: ROOM.height / 2, z: floor.position.z }))
  group.add(box(w, 0.25, 0.05, '#bfb5a2', { x: floor.position.x, y: 0.12, z: ROOM.minZ + 0.02 }))
  group.add(box(0.05, 0.25, d, '#bfb5a2', { x: ROOM.minX + 0.02, y: 0.12, z: floor.position.z }))

  // Windows on the left wall, with a sky behind them.
  for (const z of [-9, -1, 7]) {
    const sky = paintedPlane(3.4, 2.4, 128, true)
    const g = sky.ctx.createLinearGradient(0, 0, 0, sky.h)
    g.addColorStop(0, '#74c0fc')
    g.addColorStop(1, '#d0ebff')
    sky.ctx.fillStyle = g
    sky.ctx.fillRect(0, 0, sky.w, sky.h)
    sky.ctx.fillStyle = 'rgba(255,255,255,0.9)'
    for (let i = 0; i < 3; i++) {
      const cx = 20 + Math.random() * 90
      const cy = 15 + Math.random() * 40
      sky.ctx.beginPath()
      sky.ctx.ellipse(cx, cy, 18, 7, 0, 0, Math.PI * 2)
      sky.ctx.fill()
    }
    sky.texture.needsUpdate = true
    sky.mesh.position.set(ROOM.minX + 0.01, 3.6, z)
    sky.mesh.rotation.y = Math.PI / 2
    group.add(sky.mesh)
    group.add(box(0.12, 0.12, 3.6, '#ffffff', { x: ROOM.minX + 0.05, y: 2.36, z }))
    group.add(box(0.12, 0.12, 3.6, '#ffffff', { x: ROOM.minX + 0.05, y: 4.84, z }))
    group.add(box(0.12, 2.6, 0.1, '#ffffff', { x: ROOM.minX + 0.05, y: 3.6, z }))
  }

  const whiteboard = paintedPlane(8, 2.6, 640)
  // In front of its frame, which is 0.08 deep and centred on the wall's face.
  whiteboard.mesh.position.set(0, 3.9, ROOM.minZ + 0.06)
  group.add(box(8.3, 2.9, 0.08, '#adb5bd', { x: 0, y: 3.9, z: ROOM.minZ }))
  group.add(whiteboard.mesh)

  const clock = new THREE.Group()
  clock.position.set(-9.5, 4.4, ROOM.minZ + 0.05)
  const face = cyl(0.7, 0.7, 0.08, '#ffffff', {}, 32)
  face.rotation.x = Math.PI / 2
  clock.add(face)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.06, 8, 32), mat('#212529'))
  clock.add(rim)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    clock.add(box(0.05, 0.12, 0.02, '#212529', { x: Math.sin(a) * 0.58, y: Math.cos(a) * 0.58, z: 0.05 }))
  }
  const hand = (len: number, width: number) => {
    const pivot = new THREE.Group()
    pivot.position.z = 0.07
    pivot.add(box(width, len, 0.02, '#212529', { y: len / 2 }))
    clock.add(pivot)
    return pivot
  }
  const clockHands = { hour: hand(0.35, 0.06), minute: hand(0.55, 0.04) }
  group.add(clock)
  return { group, whiteboard, clockHands }
}

// ── Fixtures ────────────────────────────────────────────────────────────────

export interface Fixtures {
  group: THREE.Group
  siren: { light: THREE.PointLight, lamp: THREE.Mesh, beam: THREE.Group }
  rocket: THREE.Group
  jarBugs: THREE.Group
  shredderMouth: P3
  coffee: THREE.Group
  pongBall: THREE.Mesh
  /** The fixtures a loose ball bounces off (the ping-pong table is added by the scene as a plain box). */
  solids: THREE.Object3D[]
}

export function buildFixtures(): Fixtures {
  const group = new THREE.Group()
  const solids: THREE.Object3D[] = []

  // The archive: where done folders are filed.
  const archive = new THREE.Group()
  archive.position.set(FIXTURES.archive.x, 0, FIXTURES.archive.z)
  archive.add(box(1.4, 1.6, 1.0, '#6c757d', { y: 0.8 }))
  for (let i = 0; i < 3; i++) {
    archive.add(box(1.2, 0.42, 0.04, '#adb5bd', { y: 0.3 + i * 0.5, z: -0.52 }))
    archive.add(box(0.3, 0.05, 0.05, '#343a40', { y: 0.38 + i * 0.5, z: -0.56 }))
  }
  const doneSign = signPlane('DONE ✓', 1.2, 0.3, '#2a9d8f', '#ffffff')
  doneSign.position.set(0, 2.1, 0)
  doneSign.rotation.y = Math.PI
  archive.add(doneSign)
  const doneSignFront = doneSign.clone()
  doneSignFront.rotation.y = 0
  doneSignFront.position.z = 0.01
  archive.add(doneSignFront)
  archive.rotation.y = Math.PI
  group.add(archive)
  solids.push(archive)

  // The shredder, for deleted folders.
  const shredder = new THREE.Group()
  shredder.position.set(FIXTURES.shredder.x, 0, FIXTURES.shredder.z)
  shredder.add(box(0.9, 0.9, 0.6, '#343a40', { y: 0.45 }))
  shredder.add(box(0.95, 0.12, 0.65, '#212529', { y: 0.96 }))
  shredder.add(box(0.6, 0.03, 0.08, '#000', { y: 1.03 }))
  // Signs on the front row face the viewer, who looks at the office from the front.
  const shredSign = signPlane('SHREDDER', 0.9, 0.22, '#e63946', '#fff')
  shredSign.position.set(0, 0.6, 0.31)
  shredder.add(shredSign)
  group.add(shredder)
  solids.push(shredder)

  // The bug jar: a big glass jar with little bugs crawling in it, one per folder in Bugs.
  const jar = new THREE.Group()
  jar.position.set(FIXTURES.jar.x, 0, FIXTURES.jar.z)
  jar.add(cyl(0.5, 0.55, 0.85, '#6c584c', { y: 0.42 }))
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.9, 24, 1, true), new THREE.MeshStandardMaterial({ color: '#caf0f8', transparent: true, opacity: 0.3, side: THREE.DoubleSide }))
  glass.position.y = 1.3
  jar.add(glass)
  jar.add(cyl(0.48, 0.48, 0.08, '#e63946', { y: 1.78 }))
  const jarSign = signPlane('BUG JAR', 0.9, 0.24, '#e63946', '#fff')
  jarSign.position.set(0, 0.5, 0.56)
  jar.add(jarSign)
  const jarBugs = new THREE.Group()
  jarBugs.position.y = 0.95
  jar.add(jarBugs)
  group.add(jar)
  solids.push(jar)

  // The launch pad: ready-for-live folders wait here; shipping one launches the rocket.
  const pad = new THREE.Group()
  pad.position.set(FIXTURES.pad.x, 0, FIXTURES.pad.z)
  pad.add(cyl(1.3, 1.4, 0.3, '#495057', { y: 0.15 }, 24))
  pad.add(cyl(1.0, 1.0, 0.02, '#ffd166', { y: 0.31 }, 24))
  const padSign = signPlane('READY FOR LIVE', 1.6, 0.3, '#ffd166', '#212529')
  padSign.position.set(0, 0.17, 1.42)
  pad.add(padSign)
  const rocket = new THREE.Group()
  rocket.add(cyl(0.28, 0.32, 1.3, '#f8f9fa', { y: 0.65 }))
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 16), mat('#e63946'))
  nose.position.y = 1.6
  rocket.add(nose)
  for (let i = 0; i < 3; i++) {
    const fin = box(0.05, 0.45, 0.35, '#e63946', { y: 0.22 })
    const a = (i / 3) * Math.PI * 2
    fin.position.x = Math.sin(a) * 0.3
    fin.position.z = Math.cos(a) * 0.3
    fin.rotation.y = a
    rocket.add(fin)
  }
  rocket.add(ball(0.12, '#4cc9f0', { y: 1.0, z: 0.27 }))
  rocket.position.set(0.3, 0.32, 0)
  pad.add(rocket)
  group.add(pad)

  // The blocked shelf against the left wall, with a siren that spins while anything is stuck.
  const shelf = new THREE.Group()
  shelf.position.set(FIXTURES.shelf.x, 0, FIXTURES.shelf.z)
  for (let i = 0; i < 4; i++) shelf.add(box(0.7, 0.06, 2.2, '#8d6e63', { y: 0.45 + i * 0.7 }))
  for (const z of [-1.08, 1.08]) shelf.add(box(0.7, 2.6, 0.06, '#6d4c41', { y: 1.3, z }))
  const blockedSign = signPlane('BLOCKED', 1.6, 0.34, '#d00000', '#ffffff')
  blockedSign.position.set(0.37, 2.9, 0)
  blockedSign.rotation.y = Math.PI / 2
  shelf.add(blockedSign)
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ff1a1a', emissive: '#550000', transparent: true, opacity: 0.85 }))
  lamp.position.set(0, 3.15, 0)
  shelf.add(lamp)
  shelf.add(cyl(0.24, 0.24, 0.08, '#333', { y: 3.12 }))
  const beam = new THREE.Group()
  beam.position.copy(lamp.position)
  const light = new THREE.PointLight('#ff2020', 0, 9, 1.6)
  light.position.set(0.6, 0.1, 0)
  beam.add(light)
  shelf.add(beam)
  group.add(shelf)
  solids.push(shelf)

  // Coffee machine and water cooler: where idle people wander off to.
  const coffee = new THREE.Group()
  coffee.position.set(FIXTURES.coffee.x, 0, FIXTURES.coffee.z)
  coffee.add(box(0.8, 0.9, 1.2, '#6c757d', { y: 0.45 }))
  coffee.add(box(0.6, 0.8, 0.6, '#212529', { x: 0.05, y: 1.3 }))
  coffee.add(box(0.05, 0.2, 0.3, '#ffbe0b', { x: 0.36, y: 1.5 }))
  coffee.add(cyl(0.08, 0.07, 0.15, '#fff', { x: 0.25, y: 0.98 }))
  const coffeeSign = signPlane('COFFEE', 0.6, 0.16, '#6f4518', '#fff')
  coffeeSign.position.set(0.36, 1.85, 0)
  coffeeSign.rotation.y = Math.PI / 2
  coffee.add(coffeeSign)
  group.add(coffee)
  solids.push(coffee)

  const cooler = new THREE.Group()
  cooler.position.set(FIXTURES.cooler.x, 0, FIXTURES.cooler.z)
  cooler.add(box(0.6, 1.0, 0.6, '#f8f9fa', { y: 0.5 }))
  const bottle = cyl(0.25, 0.25, 0.6, mat('#90e0ef', { opacity: 0.6 }), { y: 1.35 })
  cooler.add(bottle)
  group.add(cooler)
  solids.push(cooler)

  // The delivery door in the right wall, where the courier comes in from the real board.
  const door = new THREE.Group()
  door.position.set(ROOM.maxX, 0, DELIVERY_DOOR_Z)
  door.add(box(0.14, 2.6, 0.14, '#495057', { y: 1.3, z: -0.85 }))
  door.add(box(0.14, 2.6, 0.14, '#495057', { y: 1.3, z: 0.85 }))
  door.add(box(0.14, 0.16, 1.84, '#495057', { y: 2.62 }))
  door.add(box(0.04, 2.5, 1.56, mat('#e9c46a', { opacity: 0.35 }), { y: 1.25 }))
  door.add(box(1.4, 0.02, 1.6, '#6b4f3a', { x: -0.8, y: 0.012 }))
  const doorSign = signPlane('DELIVERIES · FROM THE REAL BOARD', 2.6, 0.3, '#023e8a', '#fff')
  doorSign.position.set(-0.09, 3.0, 0)
  doorSign.rotation.y = -Math.PI / 2
  door.add(doorSign)
  group.add(door)

  // Plants in the corners.
  for (const [x, z] of [[-16, -13], [15.8, -13], [-16, 11], [4.5, -13]] as const) {
    const plant = new THREE.Group()
    plant.add(cyl(0.3, 0.24, 0.5, '#bc6c25', { y: 0.25 }))
    for (let i = 0; i < 5; i++) plant.add(ball(0.32, '#40916c', { x: Math.cos(i * 1.3) * 0.22, y: 0.75 + (i % 3) * 0.25, z: Math.sin(i * 1.3) * 0.22 }))
    plant.position.set(x, 0, z)
    group.add(plant)
    solids.push(plant)
  }

  // The ping-pong table, in the open floor between the windows and Pia's desk.
  const pong = new THREE.Group()
  pong.position.set(FIXTURES.pong.x, 0, FIXTURES.pong.z)
  pong.add(box(2.74, 0.06, 1.52, '#1b5e3b', { y: 0.76 }))
  // The white lines are thin strips lying on the top (y 0.79), inset from the edges: boxes as tall as the
  // tabletop and flush with its sides z-fight along every side.
  const lineY = 0.793
  pong.add(box(2.72, 0.005, 0.03, '#ffffff', { y: lineY }))
  for (const x of [-1.35, 1.35]) pong.add(box(0.03, 0.005, 1.5, '#ffffff', { x, y: lineY }))
  for (const z of [-0.74, 0.74]) pong.add(box(2.72, 0.005, 0.03, '#ffffff', { y: lineY, z }))
  pong.add(box(0.02, 0.16, 1.7, mat('#f8f9fa', { opacity: 0.7 }), { y: 0.87 }))
  for (const [x, z] of [[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]] as const) pong.add(box(0.06, 0.74, 0.06, '#343a40', { x, y: 0.37, z }))
  group.add(pong)
  const pongBall = ball(0.05, mat('#ff9f1c', { emissive: '#552200' }))
  pongBall.visible = false
  group.add(pongBall)

  return {
    group,
    siren: { light, lamp, beam },
    rocket,
    jarBugs,
    shredderMouth: { x: FIXTURES.shredder.x, y: 1.05, z: FIXTURES.shredder.z },
    coffee,
    pongBall,
    solids
  }
}

// ── Personal flair ──────────────────────────────────────────────────────────

/** What each of the crew keeps on the desk. Anyone else gets two things picked by their name. */
const FLAIR: Record<string, string[]> = {
  pia: ['calendar', 'photo'],
  wren: ['cans', 'figure'],
  wick: ['toolbox', 'photo'],
  wynn: ['lavalamp', 'stickies'],
  wade: ['mugs', 'rubik'],
  usher: ['stickies', 'cactus'],
  nina: ['pencup', 'globe'],
  quincy: ['trophy', 'stressball'],
  boss: ['nameplate', 'golftrophy'],
  cato: ['nameplate', 'golftrophy']
}
const FLAIR_POOL = ['photo', 'cactus', 'globe', 'figure', 'stressball', 'rubik', 'cans', 'mugs', 'stickies']

export function flairOf(key: string): string[] {
  if (FLAIR[key]) return FLAIR[key]
  const h = hashOf(key)
  const first = FLAIR_POOL[h % FLAIR_POOL.length]!
  const second = FLAIR_POOL[(h >> 5) % FLAIR_POOL.length]!
  return first === second ? [first, FLAIR_POOL[(h + 1) % FLAIR_POOL.length]!] : [first, second]
}

/** One desk ornament, standing on the desk top at its origin, front towards +z. `owner` is a first name. */
export function buildFlair(kind: string, owner = ''): THREE.Group {
  const g = new THREE.Group()
  const gold = mat('#ffc300', { metal: 0.85, rough: 0.25 })
  switch (kind) {
    case 'cans': {
      for (const [x, z] of [[0, 0], [0.12, 0.05], [0.05, -0.11]] as const) {
        g.add(cyl(0.045, 0.045, 0.15, '#38b000', { x, y: 0.075, z }))
        g.add(cyl(0.043, 0.043, 0.01, mat('#ced4da', { metal: 0.8, rough: 0.3 }), { x, y: 0.155, z }))
      }
      const lying = cyl(0.045, 0.045, 0.15, '#111111', { x: -0.14, y: 0.045, z: 0.06 })
      lying.rotation.z = Math.PI / 2
      g.add(lying)
      break
    }
    case 'toolbox':
      g.add(box(0.34, 0.15, 0.17, '#d00000', { y: 0.075 }))
      g.add(box(0.35, 0.02, 0.18, '#9d0208', { y: 0.155 }))
      g.add(box(0.18, 0.05, 0.03, '#343a40', { y: 0.19 }))
      break
    case 'lavalamp':
      g.add(cyl(0.05, 0.08, 0.08, mat('#6c757d', { metal: 0.6 }), { y: 0.04 }))
      g.add(cyl(0.045, 0.06, 0.26, mat('#ff006e', { emissive: '#7a0035', opacity: 0.8 }), { y: 0.21 }))
      g.add(ball(0.035, mat('#ffbe0b', { emissive: '#7a5a00' }), { y: 0.17 }))
      g.add(ball(0.025, mat('#ffbe0b', { emissive: '#7a5a00' }), { y: 0.27 }))
      g.add(cyl(0.035, 0.045, 0.05, mat('#6c757d', { metal: 0.6 }), { y: 0.365 }))
      break
    case 'mugs':
      g.add(cyl(0.06, 0.055, 0.1, '#ffffff', { y: 0.05 }))
      g.add(cyl(0.06, 0.055, 0.1, '#f4a261', { y: 0.15 }))
      g.add(cyl(0.06, 0.055, 0.1, '#2a9d8f', { x: 0.14, y: 0.05 }))
      break
    case 'stickies': {
      const colors = ['#ffd60a', '#ff8fab', '#8ecae6', '#b5e48c', '#ffd60a']
      colors.forEach((color, i) => {
        const note = box(0.09, 0.004, 0.09, color, { x: (i % 3) * 0.11, y: 0.003 + i * 0.001, z: Math.floor(i / 3) * 0.11 })
        note.rotation.y = ((i * 0.37) % 0.6) - 0.3
        g.add(note)
      })
      break
    }
    case 'pencup':
      g.add(cyl(0.055, 0.05, 0.13, '#264653', { y: 0.065 }))
      for (let i = 0; i < 4; i++) {
        const pen = cyl(0.008, 0.008, 0.18, i < 3 ? '#d00000' : '#212529', { x: Math.cos(i * 1.7) * 0.022, y: 0.16, z: Math.sin(i * 1.7) * 0.022 })
        pen.rotation.z = (i - 1.5) * 0.12
        g.add(pen)
      }
      break
    case 'trophy':
    case 'golftrophy':
      g.add(box(0.14, 0.05, 0.14, '#3c1518', { y: 0.025 }))
      g.add(cyl(0.015, 0.02, 0.08, gold, { y: 0.09 }))
      g.add(cyl(0.07, 0.03, 0.1, gold, { y: 0.18 }))
      if (kind === 'golftrophy') g.add(ball(0.025, '#ffffff', { y: 0.255 }))
      break
    case 'calendar': {
      const page = box(0.18, 0.15, 0.01, '#ffffff', { y: 0.075 })
      page.rotation.x = -0.25
      g.add(page)
      const top = box(0.18, 0.04, 0.012, '#d00000', { y: 0.15, z: -0.02 })
      top.rotation.x = -0.25
      g.add(top)
      break
    }
    case 'photo': {
      const frame = new THREE.Group()
      frame.add(box(0.2, 0.16, 0.015, '#6f4518'))
      frame.add(box(0.17, 0.13, 0.002, hueColor(`${owner}photo`, 0.5, 0.7), { z: 0.009 }))
      frame.add(ball(0.025, '#ffd6a5', { y: 0.01, z: 0.012 }))
      frame.add(ball(0.02, '#ffd6a5', { x: 0.045, y: -0.005, z: 0.012 }))
      frame.position.y = 0.085
      frame.rotation.x = -0.15
      g.add(frame)
      break
    }
    case 'cactus': {
      g.add(cyl(0.055, 0.045, 0.08, '#bc6c25', { y: 0.04 }))
      g.add(cyl(0.032, 0.032, 0.16, '#2d6a4f', { y: 0.16 }))
      g.add(ball(0.032, '#2d6a4f', { y: 0.24 }))
      const arm = cyl(0.018, 0.018, 0.07, '#2d6a4f', { x: 0.045, y: 0.17 })
      arm.rotation.z = -0.9
      g.add(arm)
      g.add(ball(0.015, '#ff8fab', { y: 0.27 }))
      break
    }
    case 'globe':
      g.add(cyl(0.07, 0.08, 0.05, '#432818', { y: 0.025 }))
      g.add(ball(0.075, mat('#caf0f8', { opacity: 0.4 }), { y: 0.12 }))
      g.add(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 8), mat('#2d6a4f')).translateY(0.11))
      break
    case 'figure':
      g.add(box(0.07, 0.02, 0.05, '#212529', { y: 0.01 }))
      g.add(box(0.06, 0.08, 0.04, hueColor(`${owner}figure`), { y: 0.06 }))
      g.add(ball(0.035, '#ffdbac', { y: 0.13 }))
      break
    case 'stressball':
      g.add(ball(0.05, '#ff006e', { y: 0.05 }))
      break
    case 'rubik': {
      const sides = ['#d00000', '#ffd60a', '#2a9d8f', '#ffffff', '#f77f00', '#0077b6', '#2a9d8f', '#d00000']
      sides.forEach((color, i) => g.add(box(0.045, 0.045, 0.045, color, { x: (i & 1) * 0.05, y: 0.025 + ((i >> 1) & 1) * 0.05, z: (i >> 2) * 0.05 })))
      break
    }
    case 'nameplate': {
      g.add(box(0.5, 0.03, 0.1, gold, { y: 0.015 }))
      const plate = signPlane(owner ? `${owner.toUpperCase()} · BOSS` : 'BOSS', 0.5, 0.1, '#2b2d42', '#ffd166')
      plate.position.set(0, 0.075, 0.02)
      plate.rotation.x = -0.35
      g.add(plate)
      break
    }
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true
  })
  return g
}

export function buildBug(): THREE.Group {
  const g = new THREE.Group()
  const shell = ball(0.07, '#2b9348')
  shell.scale.set(1, 0.6, 1.4)
  g.add(shell)
  g.add(ball(0.045, '#1b4332', { z: 0.1 }))
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) g.add(box(0.12, 0.012, 0.012, '#111', { x: side * 0.07, y: -0.01, z: -0.05 + i * 0.05 }))
  }
  return g
}
