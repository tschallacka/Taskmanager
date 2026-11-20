// Speed, step E: the session is read once for the app start. The plugins and the route middleware used to call
// authClient.getSession() each on its own, so a reload sent it four times (owner HAR, 2026-11-15). createSessionCache is a
// pure module, so its behaviour is checked directly; the callers are checked at source level.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createSessionCache } from '../app/utils/sessionCache'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function fakeClock(start = 0) {
  let t = start
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms
    }
  }
}

test('several reads inside the window share one request', async () => {
  const clock = fakeClock()
  let calls = 0
  const cache = createSessionCache(async () => {
    calls += 1
    return { user: 'wade' }
  }, clock.now, 30_000)
  const a = await cache.get()
  const b = await cache.get()
  clock.advance(5_000)
  const c = await cache.get()
  assert.equal(calls, 1, 'one request for three reads')
  assert.deepEqual(a, { user: 'wade' })
  assert.deepEqual(b, a)
  assert.deepEqual(c, a)
})

test('a read after the window asks the server again', async () => {
  const clock = fakeClock()
  let calls = 0
  const cache = createSessionCache(async () => {
    calls += 1
    return calls
  }, clock.now, 30_000)
  await cache.get()
  clock.advance(30_000)
  assert.equal(await cache.get(), 2, 'the window is over')
  assert.equal(calls, 2)
})

test('forget() drops the value, so the next read asks the server (sign-in, sign-out)', async () => {
  let calls = 0
  const cache = createSessionCache(async () => {
    calls += 1
    return calls
  }, fakeClock().now, 30_000)
  await cache.get()
  cache.forget()
  assert.equal(await cache.get(), 2)
})

test('a failed read is not kept: the next read asks again', async () => {
  let calls = 0
  const cache = createSessionCache(async () => {
    calls += 1
    if (calls === 1) throw new Error('network down')
    return 'ok'
  }, fakeClock().now, 30_000)
  await assert.rejects(cache.get(), /network down/)
  assert.equal(await cache.get(), 'ok')
  assert.equal(calls, 2)
})

test('the start plugins and the route middleware read the session through readSession, not authClient.getSession', () => {
  const callers = [
    'app/middleware/auth.global.ts',
    'app/middleware/instance-admin.ts',
    'app/plugins/realtime.client.ts',
    'app/plugins/init-projects.client.ts',
    'app/plugins/init-settings.client.ts'
  ]
  for (const path of callers) {
    const source = read(path)
    assert.doesNotMatch(source, /authClient\.getSession\(\)/, `${path} asks the server directly`)
    assert.match(source, /readSession\(\)/, `${path} reads through readSession`)
  }
})

test('the session cache is forgotten on the login page, so a sign-in in the app is seen at once', () => {
  const middleware = read('app/middleware/auth.global.ts')
  const login = middleware.indexOf('if (to.path === \'/login\')')
  assert.ok(login >= 0, 'the login check is there')
  assert.match(middleware.slice(login, login + 120), /forgetSession\(\)/, 'the login page forgets the cached session first')
})

test('the session is read from the auth client\'s own store: one request, shared by every reader', () => {
  const auth = read('app/composables/useAuth.ts')
  assert.match(auth, /createSessionCache\(readStoreSession\)/, 'the cache wraps the store read')
  const store = auth.slice(auth.indexOf('function readStoreSession()'), auth.indexOf('function readStoreSession()') + 700)
  assert.match(store, /authClient\.useSession\(\)/, 'the store read subscribes to the store, which makes its one request')
  const asks = auth.match(/authClient\.getSession\(\)/g) ?? []
  assert.equal(asks.length, 1, 'the server is asked once, and only as the fallback when the store stays pending')
  const fallback = auth.indexOf('() => authClient.getSession()')
  assert.ok(fallback > auth.indexOf('function readStoreSession()') && fallback < auth.indexOf('const sessionCache'), 'the one ask is inside readStoreSession')
  assert.match(auth, /export function readSession\(\)/)
  assert.match(auth, /export function forgetSession\(\)/)
  const forget = auth.slice(auth.indexOf('export function forgetSession()'), auth.indexOf('export function forgetSession()') + 400)
  assert.match(forget, /\$sessionSignal/, 'forgetting asks the store for a fresh answer')
  assert.match(store, /staleAfter/, 'a read after a sign-in waits for the store\'s new answer, not the stale one')
})
