// Pia's Stop hook tells a board outage from a listener that is really down (card mwifm8qa5n044bzymkl). With the board
// unreachable the kit retries by itself, so the hook does not block: it says so and lets the agent stop. With the board
// healthy and no listener, it blocks and tells her to start one. The hook runs as a real shell script against a fake
// board. Run:
//   cd crew && node --test pia-listener-hook.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const kit = import.meta.dirname
const hook = join(kit, 'pia-listener-hook.sh')

// A crew home whose creds.json points at `base`, with no listener pid file.
function crewHome(base) {
  const home = mkdtempSync(join(tmpdir(), 'crew-hook-'))
  writeFileSync(join(home, 'creds.json'), JSON.stringify({ base, people: {} }))
  return home
}

// Asynchronous on purpose: a fake board in this process must keep answering while the hook's health probe runs.
function runStopHook(home) {
  return new Promise((resolve) => {
    const child = execFile('sh', [hook, 'stop', home, kit], { encoding: 'utf8', timeout: 60000 }, (error, stdout) => resolve(stdout ?? ''))
    child.stdin.end('{}')
  })
}

test('with the board unreachable, the stop is not blocked: the kit retries by itself and the agent may stop', async () => {
  // A port nothing listens on: the connection is refused at once.
  const out = await runStopHook(crewHome('http://127.0.0.1:9'))
  assert.doesNotMatch(out, /"decision":"block"/)
  assert.match(out, /board is unreachable/)
  assert.match(out, /retries by itself/)
  assert.match(out, /you may stop/)
})

test('with the board healthy and no listener, the stop is blocked and she is told to start one', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const out = await runStopHook(crewHome(`http://127.0.0.1:${server.address().port}`))
    assert.match(out, /"decision":"block"/)
    assert.match(out, /Your own board listener is not running/)
  } finally {
    server.close()
  }
})

test('with the board answering HTML (a deploy), it counts as unreachable: no block', async () => {
  const server = createServer((req, res) => {
    res.writeHead(502, { 'content-type': 'text/html' })
    res.end('<html>502 Bad Gateway</html>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const out = await runStopHook(crewHome(`http://127.0.0.1:${server.address().port}`))
    assert.doesNotMatch(out, /"decision":"block"/)
    assert.match(out, /board is unreachable/)
  } finally {
    server.close()
  }
})
