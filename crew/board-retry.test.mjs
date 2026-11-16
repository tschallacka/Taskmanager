// The board call a listener makes survives an outage (card mwifm8qa5n044bzymkl): an HTML answer, a 5xx or a connection
// error is retried with backoff (60 s, doubling, capped at 5 min) and never ends the listener; a 4xx is a fault and is
// thrown at once. The fetch, the sleep and the log are fakes, so no time passes and no server is needed. Run:
//   cd crew && node --test board-retry.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { boardRequest, listenerCall, backoffMs, statusWait, STATUS_PATH } from './board-retry.mjs'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const html = (status = 502) => new Response('<html><body>502 Bad Gateway</body></html>', { status, headers: { 'content-type': 'text/html' } })

// A fake board: each call takes the next answer from `answers`; a function answer is called with the request.
function fakeBoard(answers) {
  const calls = []
  const waits = []
  const logs = []
  const fetchImpl = async (url, init) => {
    calls.push(url)
    if (url.endsWith(STATUS_PATH)) return new Response('', { status: 404 })
    const next = answers.shift()
    if (next instanceof Error) throw next
    return typeof next === 'function' ? next(url, init) : next
  }
  return {
    calls,
    waits,
    logs,
    run: (req = { url: 'https://board.example/api/mcp', init: { method: 'POST' } }) => boardRequest(req, {
      fetchImpl,
      sleep: async (ms) => { waits.push(ms) },
      log: line => logs.push(line)
    })
  }
}

test('a 502 HTML answer, then a 503, then a connection error, then JSON: the listener gets the JSON and waits 60, 120, 240 s', async () => {
  const board = fakeBoard([html(502), html(503), new TypeError('fetch failed'), json({ ok: true })])
  const result = await board.run()
  assert.deepEqual(result, { ok: true })
  assert.deepEqual(board.waits, [60000, 120000, 240000])
})

test('the wait doubles and stops at 5 minutes', () => {
  assert.equal(backoffMs(0), 60000)
  assert.equal(backoffMs(1), 120000)
  assert.equal(backoffMs(2), 240000)
  assert.equal(backoffMs(3), 300000)
  assert.equal(backoffMs(9), 300000)
})

test('an outage is reported once on stderr, not on every retry', async () => {
  const board = fakeBoard([html(502), html(502), html(502), json({ ok: true })])
  await board.run()
  assert.equal(board.logs.length, 1)
  assert.match(board.logs[0], /board unreachable/)
})

test('a 200 answer that is HTML is an outage too, not a parse crash', async () => {
  const board = fakeBoard([new Response('<!doctype html><html>deploying</html>', { status: 200, headers: { 'content-type': 'text/html' } }), json({ tasks: [] })])
  assert.deepEqual(await board.run(), { tasks: [] })
  assert.deepEqual(board.waits, [60000])
})

test('a 401 is a fault: thrown at once, no retry', async () => {
  const board = fakeBoard([json({ error: 'unauthorized' }, 401)])
  await assert.rejects(board.run(), /401/)
  assert.deepEqual(board.waits, [])
})

test('an absent status file (404) means plain backoff: the waits do not change', async () => {
  const board = fakeBoard([html(502), json({ ok: true })])
  await board.run()
  assert.deepEqual(board.waits, [60000])
})

test('the status file, when present, says why and gives retry_after; the kit waits that long and no more than 5 minutes', () => {
  assert.deepEqual(statusWait({ state: 'deploying', reason: 'deploy 4f2a', retry_after: 120 }, 0), { waitMs: 120000, reason: 'deploying: deploy 4f2a' })
  assert.equal(statusWait({ state: 'down', retry_after: 9999 }, 0).waitMs, 300000, 'a bad file is never trusted beyond the cap')
  assert.equal(statusWait({ state: 'down' }, 2).waitMs, 240000, 'no retry_after: plain backoff')
  assert.equal(statusWait(null, 1).waitMs, 120000, 'no file: plain backoff')
})

test('the status file is read after a failure and its reason is logged', async () => {
  let boardCalls = 0
  const fetchImpl = async (url) => {
    if (url.endsWith(STATUS_PATH)) return json({ state: 'deploying', reason: 'deploy 4f2a', retry_after: 90 })
    boardCalls++
    return boardCalls === 1 ? html(502) : json({ ok: true })
  }
  const waits = []
  const logs = []
  const sleep = async (ms) => {
    waits.push(ms)
  }
  await boardRequest({ url: 'https://board.example/api/mcp', init: { method: 'POST' } }, { fetchImpl, sleep, log: l => logs.push(l) })
  assert.deepEqual(waits, [90000])
  assert.match(logs[0], /deploying: deploy 4f2a/)
})

test('listen.mjs makes its board call through the retry helper', () => {
  const listen = readFileSync(join(import.meta.dirname, 'listen.mjs'), 'utf8')
  assert.match(listen, /from '\.\/board-retry\.mjs'/)
  assert.doesNotMatch(listen, /await res\.json\(\)/, 'the listener no longer parses the answer itself')
})

// M1 (review card, Nina): a bad key (4xx) must not end the listener. The listener's call is listenerCall: a 4xx is
// logged once and answered as null, as the listener did before the retry helper; an outage still waits.
test('a 401 through the listener call is null and one stderr line, not an exception: the listener goes on', async () => {
  const logs = []
  const result = await listenerCall({ url: 'https://board.example/api/mcp', init: { method: 'POST' } }, {
    fetchImpl: async () => json({ error: 'unauthorized' }, 401),
    sleep: async () => {},
    log: line => logs.push(line)
  })
  assert.equal(result, null)
  assert.equal(logs.length, 1)
  assert.match(logs[0], /401/)
})

test('a 502 HTML, then JSON, through the listener call: the JSON comes back, and the wait is 60 s', async () => {
  const answers = [html(502), json({ ok: true })]
  const waits = []
  const result = await listenerCall({ url: 'https://board.example/api/mcp', init: { method: 'POST' } }, {
    fetchImpl: async url => (url.endsWith(STATUS_PATH) ? new Response('', { status: 404 }) : answers.shift()),
    sleep: async (ms) => { waits.push(ms) },
    log: () => {}
  })
  assert.deepEqual(result, { ok: true })
  assert.deepEqual(waits, [60000])
})

// S1 (review card, Nina): a socket that connects and never answers must not stall the listener. The board call has a
// timeout (30 s by default, passed in deps here as 50 ms); a timeout is an outage and is retried.
test('a board call that never answers is aborted by its timeout, counted as an outage, and retried', async () => {
  let calls = 0
  const seenSignals = []
  const fetchImpl = (url, init) => {
    if (url.endsWith(STATUS_PATH)) return Promise.resolve(new Response('', { status: 404 }))
    calls++
    seenSignals.push(init?.signal)
    if (calls === 1) {
      return new Promise((_resolve, reject) => {
        // AbortSignal.timeout's timer does not keep the process alive: a ref'd timer does, until the abort.
        const keepAlive = setTimeout(() => {}, 10_000)
        init.signal.addEventListener('abort', () => {
          clearTimeout(keepAlive)
          reject(new DOMException('timed out', 'TimeoutError'))
        })
      })
    }
    return Promise.resolve(json({ ok: true }))
  }
  const logs = []
  const result = await boardRequest({ url: 'https://board.example/api/mcp', init: { method: 'POST' } }, {
    fetchImpl,
    timeoutMs: 50,
    sleep: async () => {},
    log: line => logs.push(line)
  })
  assert.deepEqual(result, { ok: true })
  assert.equal(calls, 2)
  assert.ok(seenSignals.every(signal => signal instanceof AbortSignal), 'every board call carries an abort signal')
  assert.match(logs[0] ?? '', /connection error/)
})

test('the board call and the status probe carry a timeout in the helper (30 s and 5 s)', () => {
  const helper = readFileSync(join(import.meta.dirname, 'board-retry.mjs'), 'utf8')
  assert.match(helper, /timeoutMs \?\? 30_?000/)
  assert.match(helper, /AbortSignal\.timeout\(5_?000\)/)
})

test('the listener calls the board through listenerCall, not the bare helper', () => {
  const listen = readFileSync(join(import.meta.dirname, 'listen.mjs'), 'utf8')
  assert.match(listen, /listenerCall\(/)
  assert.doesNotMatch(listen, /boardRequest\(/)
})
