// `crew people add` run through its entry point (crew/crew.mjs) against a fake board: the route's answer, the merge into
// creds.json, the cast, and the refusals. No real board, no network beyond 127.0.0.1. Temp folders only.
// Run from the repo root: node --test crew/people-route.test.mjs
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const KIT = dirname(fileURLToPath(import.meta.url))
const CREW = join(KIT, 'crew.mjs')
const scratch = mkdtempSync(join(tmpdir(), 'crew-people-route-'))
const TOKEN = 'tok-route-test'
const SECRET_PW = 'PW-ROUTE-SECRET'
const SECRET_KEY = 'arn_ROUTE_SECRET'

// What the fake board does: POST adds the people it has not got yet; GET shows the cast.
const board = { missing: ['susy'], refuse: null, lastBody: null, lastAuth: null }
let server
let origin

before(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      const send = (status, json) => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(json))
      }
      board.lastAuth = req.headers.authorization ?? null
      if (board.refuse) return send(board.refuse, { message: 'refused' })
      if (req.method === 'POST' && req.url === '/api/crews/acme/people') {
        board.postAuth = req.headers.authorization ?? null
        board.lastBody = body ? JSON.parse(body) : {}
        const wanted = board.lastBody.people ?? board.missing
        const people = {}
        for (const key of wanted) {
          if (!board.missing.includes(key)) continue
          people[key] = { id: `u-${key}`, name: key, role: 'member', email: `${key}@acme.invalid`, password: SECRET_PW, apiKey: `${SECRET_KEY}_${key}` }
        }
        board.missing = board.missing.filter(key => !people[key])
        return send(200, { crew: { slug: 'acme' }, people })
      }
      if (req.method === 'GET' && req.url === '/api/crews/acme') {
        return send(200, { cast: [{ key: 'susy', present: !board.missing.includes('susy') }, { key: 'wade', present: true }] })
      }
      send(404, { message: 'not found' })
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
})

after(() => {
  server?.close()
  rmSync(scratch, { recursive: true, force: true })
})

/** A crew home with crew.json pointing at the fake board, and a creds.json with one existing person. */
function crewHome(name) {
  const home = join(scratch, name)
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'crew.json'), JSON.stringify({ team: 'Acme', product: { name: 'Acme', repo: '' }, board: { url: origin }, crew: { slug: 'acme' } }))
  writeFileSync(join(home, 'creds.json'), JSON.stringify({ people: { wade: { email: 'wade@acme.invalid', password: 'old', apiKey: 'arn_old' } } }), { mode: 0o600 })
  return home
}

/** Runs `crew people add ...` through the entry point, with the token in the environment and init kept out of the real home. */
// Asynchronous on purpose: the fake board lives in this process, so a blocking spawn would stop it from answering.
function runAdd(home, args, { token = TOKEN } = {}) {
  const env = { ...process.env, CREW_HOME: home, CLAUDE_CONFIG_DIR: join(scratch, 'claude'), XDG_CONFIG_HOME: join(scratch, 'xdg') }
  delete env.TASKMANAGER_MANAGEMENT_TOKEN
  if (token !== null) env.TASKMANAGER_MANAGEMENT_TOKEN = token
  return new Promise((resolve) => {
    execFile(process.execPath, [CREW, 'people', 'add', ...args], { encoding: 'utf8', env, timeout: 120000 }, (error, stdout, stderr) => {
      resolve({ status: error ? (error.code ?? 1) : 0, stdout, stderr })
    })
  })
}

describe('crew people add: through the entry point, against a fake board', () => {
  test('a missing person is added: the old entry stays, the key is in creds.json at 0600, only names are printed', async () => {
    board.missing = ['susy']
    board.refuse = null
    const home = crewHome('add')
    const out = await runAdd(home, [])
    assert.equal(board.postAuth, `Bearer ${TOKEN}`, 'the token goes in the header of the POST')
    const creds = JSON.parse(readFileSync(join(home, 'creds.json'), 'utf8'))
    assert.equal(creds.people.wade.apiKey, 'arn_old', 'the old entry is untouched')
    assert.equal(creds.people.susy.apiKey, `${SECRET_KEY}_susy`)
    assert.equal(statSync(join(home, 'creds.json')).mode & 0o777, 0o600)
    assert.match(out.stdout, /added susy/)
    assert.match(out.stdout, /susy: present/)
    assert.match(out.stdout, /tell Pia: new people susy/)
    assert.doesNotMatch(out.stdout + out.stderr, new RegExp(`${SECRET_PW}|${SECRET_KEY}`), 'no key or password on stdout or stderr')
  })

  test('nobody missing: "nothing to add", the cast, and creds.json is the same', async () => {
    board.missing = []
    const home = crewHome('nothing')
    const before = readFileSync(join(home, 'creds.json'), 'utf8')
    const out = await runAdd(home, [])
    assert.match(out.stdout, /nothing to add/)
    assert.equal(readFileSync(join(home, 'creds.json'), 'utf8'), before)
  })

  test('--people names the people asked for, and the body carries exactly that list', async () => {
    board.missing = ['susy']
    const home = crewHome('named')
    await runAdd(home, ['--people', 'susy'])
    assert.deepEqual(board.lastBody, { people: ['susy'] })
  })

  test('a refused token gets one refusal sentence on stdout and changes nothing', async () => {
    board.missing = ['susy']
    board.refuse = 403
    const home = crewHome('refused')
    const before = readFileSync(join(home, 'creds.json'), 'utf8')
    const out = await runAdd(home, [])
    board.refuse = null
    assert.match(out.stdout, /The board refused this token/)
    assert.equal(out.status, 3)
    assert.equal(readFileSync(join(home, 'creds.json'), 'utf8'), before)
  })

  test('no token in the environment: refused before the board is asked', async () => {
    board.missing = ['susy']
    const home = crewHome('no-token')
    const out = await runAdd(home, [], { token: null })
    assert.match(out.stdout, /TASKMANAGER_MANAGEMENT_TOKEN is not set/)
    assert.equal(out.status, 2)
  })
})
