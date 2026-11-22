// The tester copy script (crew/tester-copy.sh, card mwc6mh6h2kwx7hb69ry), tested without starting anything: it parses, it refuses
// an unknown key, a missing branch and a key with no port in crew.json, and stop is safe when nothing runs. The ports come
// from crew.json (devServers), not from the script.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const SCRIPT = fileURLToPath(new URL('./tester-copy.sh', import.meta.url))

function crewHome(devServers) {
  const home = mkdtempSync(join(tmpdir(), 'tester-copy-home-'))
  writeFileSync(join(home, 'crew.json'), `${JSON.stringify({ devServers })}\n`)
  writeFileSync(join(home, 'dev.env'), 'PORT=3000\n')
  return home
}

function run(args, home) {
  return spawnSync('sh', [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, CREW_HOME: home } })
}

const PORTS = { quincy: 3105, usher: 3106, pat: 3107, nina: 3108 }

test('the script parses (sh -n)', () => {
  const parse = spawnSync('sh', ['-n', SCRIPT], { encoding: 'utf8' })
  assert.equal(parse.status, 0, parse.stderr)
})

test('an unknown key is refused with a usage line and exit 64, before anything runs', () => {
  for (const key of ['wren', 'boss', '']) {
    const res = run(['start', key, 'wick/x'], crewHome(PORTS))
    assert.equal(res.status, 64, `${key || '(empty)'} is refused`)
    assert.match(res.stderr, /usage: sh tester-copy\.sh/)
  }
})

test('start without a branch is refused with exit 64', () => {
  const res = run(['start', 'quincy'], crewHome(PORTS))
  assert.equal(res.status, 64)
  assert.match(res.stderr, /start needs the branch on origin/)
})

test('a tester key with no port in crew.json is refused, and names the file', () => {
  const res = run(['start', 'quincy', 'wick/x'], crewHome({ usher: 3106 }))
  assert.equal(res.status, 64)
  assert.match(res.stderr, /no port for quincy in crew\.json/)
})

test('stop with nothing running is safe: exit 0, and it says so', () => {
  const res = run(['stop', 'quincy'], crewHome(PORTS))
  assert.equal(res.status, 0)
  assert.match(res.stdout, /quincy copy is not running/)
})

test('status with nothing running says not running, and reads no port it was not given', () => {
  const res = run(['status', 'nina'], crewHome(PORTS))
  assert.equal(res.status, 0)
  assert.match(res.stdout, /not running/)
})
