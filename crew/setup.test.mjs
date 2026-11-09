// Tests for `crew setup` (setup.mjs): a fake crew API on 127.0.0.1, a temp HOME and CREW_HOME. Nothing
// reaches a real board or the real crew folder. Run from the repo root: node --test crew/setup.test.mjs
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { after, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const KIT = dirname(fileURLToPath(import.meta.url))
const SETUP = join(KIT, 'setup.mjs')
const TOKEN = 'arn_mgmt_fake_token_for_tests'
const scratch = mkdtempSync(join(tmpdir(), 'crew-setup-test-'))
after(() => rmSync(scratch, { recursive: true, force: true }))

// The fake API: targets for one board, the create (201 or 409), and the keys route (JSON).
function fakeApi({ createStatus = 201 } = {}) {
  const seen = { auth: [], creates: 0, keys: 0 }
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      // init.mjs also calls the board URL (the fake server) without a token: only the crew API is recorded here.
      if (req.url.startsWith('/api/crews')) seen.auth.push(req.headers.authorization)
      const send = (status, json) => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(json))
      }
      const origin = `http://127.0.0.1:${server.address().port}`
      if (req.method === 'GET' && req.url === '/api/crews/targets') {
        return send(200, { teams: [{ name: 'Team A', userboards: [{ board_id: 'real-1', board_name: 'Launch board' }] }] })
      }
      if (req.method === 'POST' && req.url === '/api/crews') {
        seen.creates += 1
        seen.body = JSON.parse(body)
        if (createStatus === 409) return send(409, { message: 'The slug is taken.' })
        return send(201, {
          slug: seen.body.slug,
          team: 'Team A',
          crew: { boardUrl: `${origin}/projects/crew-board-1` },
          real_board: { board_id: 'real-1', board_name: 'Launch board', url: `${origin}/projects/real-1` },
          shadow_board: { board_id: 'shadow-1', board_name: 'Launch board crew board', url: `${origin}/projects/shadow-1` },
          userboard: { board_id: 'real-1' },
          keys_url: `/api/crews/${seen.body.slug}/keys`
        })
      }
      if (req.method === 'POST' && req.url.startsWith(`/api/crews/${seen.body?.slug}/keys`)) {
        seen.keys += 1
        return send(200, { base: origin, people: { pia: { api_key: 'SECRET-KEY-VALUE' } } })
      }
      send(404, { message: 'not found' })
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, seen, origin: `http://127.0.0.1:${server.address().port}` }))
  })
}

// Async on purpose: the fake API runs in this process, so a blocking spawn would never be answered.
function runSetup(origin, extra, { token = TOKEN, home } = {}) {
  const env = { ...process.env, HOME: join(scratch, 'home'), CREW_HOME: home, TASKMANAGER_MANAGEMENT_TOKEN: token }
  if (!token) delete env.TASKMANAGER_MANAGEMENT_TOKEN
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SETUP, '--origin', origin, '--board', 'real-1', '--repo', '/srv/repo', ...extra], { env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.stdin.end()
    child.on('close', status => resolve({ status, stdout, stderr }))
  })
}

describe('crew setup', () => {
  test('makes a new crew bound to the board, writes creds.json (600) and crew.json with the shadow board as the work board', async () => {
    const { server, seen, origin } = await fakeApi()
    try {
      const home = join(scratch, 'home-ok')
      const run = await runSetup(origin, ['--slug', 'launch-crew'], { home })
      assert.equal(run.status, 0, run.stderr)
      assert.equal(seen.creates, 1)
      assert.equal(seen.keys, 1)
      assert.equal(seen.body.projectId, 'real-1', 'the crew is bound to the board')
      assert.equal(seen.body.rotate, undefined, 'the create never rotates')
      assert.ok(seen.auth.length >= 3, 'the targets, the create and the keys were called')
      assert.ok(seen.auth.every(value => value === `Bearer ${TOKEN}`), 'the token travels in the header only')

      const crew = JSON.parse(readFileSync(join(home, 'crew.json'), 'utf8'))
      assert.equal(crew.board.id, 'shadow-1')
      assert.equal(crew.board.url, `${origin}/projects/shadow-1`)
      assert.equal(crew.crew.slug, 'launch-crew')
      assert.equal(crew.product.repo, '/srv/repo')
      assert.equal(statSync(join(home, 'creds.json')).mode & 0o777, 0o600)
      assert.equal(statSync(home).mode & 0o777, 0o700)
    } finally {
      server.close()
    }
  })

  test('prints three plain lines and never the token or a key', async () => {
    const { server, origin } = await fakeApi()
    try {
      const run = await runSetup(origin, ['--slug', 'quiet-crew'], { home: join(scratch, 'home-quiet') })
      const text = `${run.stdout}${run.stderr}`
      assert.ok(!text.includes(TOKEN), 'no token in the output')
      assert.ok(!text.includes('SECRET-KEY-VALUE'), 'no key in the output')
      assert.match(run.stdout, /Crew home: .*home-quiet/)
      assert.match(run.stdout, /Work board: http:\/\/127\.0\.0\.1:\d+\/projects\/shadow-1/)
      // init needs a browser and a repository, which the test does not have: then the command says so instead.
      assert.match(run.stdout, /Boss prompt from PROMPTS\.md|init did not finish \(exit \d+\)/)
    } finally {
      server.close()
    }
  })

  test('a taken slug stops with 409 and no rotate, and asks for another slug', async () => {
    const { server, seen, origin } = await fakeApi({ createStatus: 409 })
    try {
      const run = await runSetup(origin, ['--slug', 'taken-crew'], { home: join(scratch, 'home-taken') })
      assert.equal(run.status, 1)
      assert.match(run.stderr, /the slug "taken-crew" is taken/)
      assert.match(run.stderr, /Nothing was rotated/)
      assert.equal(seen.keys, 0, 'no keys are fetched for a crew that was not made')
      assert.equal(seen.body.rotate, undefined)
    } finally {
      server.close()
    }
  })

  test('without a token it stops before any call, and says where the token goes', async () => {
    const { server, seen, origin } = await fakeApi()
    try {
      const run = await runSetup(origin, [], { token: '', home: join(scratch, 'home-none') })
      assert.equal(run.status, 2)
      assert.match(run.stderr, /TASKMANAGER_MANAGEMENT_TOKEN/)
      assert.equal(seen.creates, 0)
    } finally {
      server.close()
    }
  })

  test('a token passed as an argument is refused as an unknown flag', () => {
    const run = spawnSync(process.execPath, [SETUP, '--origin', 'http://127.0.0.1:1', '--board', 'b', '--repo', '/x', '--token', TOKEN], { encoding: 'utf8' })
    assert.equal(run.status, 2)
    assert.match(run.stderr, /unknown flag --token/)
  })
})
