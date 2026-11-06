// A browser without WebGL: the 3D office must not throw on mount. The page keeps its header and shows one
// plain line where the room would be. Run:
//   node --import tsx --test tests/office-webgl-fallback.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type * as THREE from 'three'

// ── Just enough browser for the scene, as in office-scene.test.ts ──────────

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

// What three.js throws when the browser has no WebGL context.
const noWebGL = () => {
  throw new Error('Error creating WebGL context.')
}

test('without WebGL the office does not throw on mount, and there is no scene', async () => {
  const { openOfficeScene } = await import('../app/office/openScene')
  const container = element() as unknown as HTMLElement
  // The scene reports the missing WebGL on the console; the test only checks that the page gets no scene.
  const warn = console.warn
  console.warn = () => {}
  try {
    assert.equal(openOfficeScene(container, { renderer: noWebGL }), null)
  } finally {
    console.warn = warn
  }
})

test('with WebGL the office opens a scene that can be disposed', async () => {
  const { openOfficeScene } = await import('../app/office/openScene')
  const container = element() as unknown as HTMLElement
  const scene = openOfficeScene(container, { renderer: fakeRenderer })
  assert.ok(scene, 'a scene should open when the renderer starts')
  scene.dispose()
})
