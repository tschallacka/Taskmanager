// The pinned-board list is fetched once while a load is in flight: the sidebar and the projects list both ask for it
// when a page opens, and two asks must make one request. No database needed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computed, ref } from 'vue'

const calls: string[] = []
let release: () => void = () => {}
const answer = [{ projectId: 'p1', name: 'Board', customerName: null, teamId: null, teamName: null }]

Object.assign(globalThis, {
  ref,
  computed,
  $fetch: (path: string) => {
    calls.push(path)
    return new Promise((resolve) => {
      release = () => resolve(answer)
    })
  }
})

const { usePins } = await import('../app/composables/usePins')

test('two loads while the first is in flight make one request and both see the list', async () => {
  const { loadPins, pinsLoaded, pins } = usePins()
  const first = loadPins()
  const second = loadPins()
  assert.equal(calls.length, 1)
  release()
  await Promise.all([first, second])
  assert.equal(pinsLoaded.value, true)
  assert.deepEqual(pins.value, answer)
})

test('after the list has loaded, a new load asks the server again', async () => {
  calls.length = 0
  const { loadPins } = usePins()
  const again = loadPins()
  assert.equal(calls.length, 1)
  release()
  await again
  assert.equal(calls.length, 1)
})
