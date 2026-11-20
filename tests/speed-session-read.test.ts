// Speed, the session read (Nina's MUST 2 on card mwibpggp): readSessionFromStore resolves with the store's answer only once it is
// no longer pending. When the wait runs out and the store is still pending (or still holds the answer the login page saw), it asks
// the server and resolves with that. It never resolves with a pending value, which would send a signed-in person to /login.
// A fake store does the work here: the store is the auth client's, and it stays pending in the first case.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readSessionFromStore, type SessionValue, type StoreView } from '../app/utils/sessionRead'

function fakeStore(initial: SessionValue<{ user: string }>): StoreView<{ user: string }> & { set: (next: SessionValue<{ user: string }>) => void } {
  let current = initial
  const listeners = new Set<() => void>()
  return {
    value: () => current,
    onChange(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    set(next) {
      current = next
      for (const fn of [...listeners]) fn()
    }
  }
}

const pending: SessionValue<{ user: string }> = { data: null, error: null, isPending: true }
const signedIn = { user: 'wade' }
const ready = (data: { user: string } | null): SessionValue<{ user: string }> => ({ data, error: null, isPending: false })

test('a store that stays pending past the wait: the read asks the server and resolves with its answer, never with the pending value', async () => {
  const store = fakeStore(pending)
  let asked = 0
  const answer = await readSessionFromStore(store, async () => {
    asked += 1
    return { data: signedIn, error: null }
  }, null, 20)
  assert.equal(asked, 1, 'the server is asked once')
  assert.deepEqual(answer.data, signedIn, 'the signed-in person is not sent to /login')
  assert.equal(store.value().isPending, true, 'the store is still pending; the answer did not come from it')
})

test('a server that also fails leaves the read rejected, not resolved with a pending value', async () => {
  const store = fakeStore(pending)
  await assert.rejects(readSessionFromStore(store, async () => {
    throw new Error('network down')
  }, null, 20), /network down/)
})

test('a store that answers before the wait is over: its answer is used and the server is not asked', async () => {
  const store = fakeStore(pending)
  let asked = 0
  const reading = readSessionFromStore(store, async () => {
    asked += 1
    return { data: null, error: null }
  }, null, 200)
  setTimeout(() => store.set(ready(signedIn)), 5)
  const answer = await reading
  assert.deepEqual(answer.data, signedIn)
  assert.equal(asked, 0)
})

test('a store that answers while the server is still being asked: the store wins, the late server answer is dropped', async () => {
  const store = fakeStore(pending)
  const reading = readSessionFromStore(store, () => new Promise(resolve => setTimeout(() => resolve({ data: null, error: null }), 80)), null, 10)
  setTimeout(() => store.set(ready(signedIn)), 30)
  const answer = await reading
  assert.deepEqual(answer.data, signedIn, 'the store answer is the one that counts')
})

test('the answer the login page saw is stale: a read waits for the store\'s new answer, and asks the server when none comes', async () => {
  const stale = ready(null)
  const store = fakeStore(stale)
  let asked = 0
  const reading = readSessionFromStore(store, async () => {
    asked += 1
    return { data: signedIn, error: null }
  }, stale, 30)
  setTimeout(() => store.set(ready(signedIn)), 5)
  assert.deepEqual((await reading).data, signedIn, 'the new store answer is used')
  assert.equal(asked, 0)

  const again = fakeStore(stale)
  const late = await readSessionFromStore(again, async () => {
    asked += 1
    return { data: signedIn, error: null }
  }, stale, 20)
  assert.deepEqual(late.data, signedIn, 'with no new store answer, the server answers')
  assert.equal(asked, 1)
})
