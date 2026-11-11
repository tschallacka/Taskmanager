// `crew people add`, the merge into creds.json (card mw9m0rwynhwj8y2odd, step 1). Temp folders only, no network.
// Run from the repo root: node --test crew/people.test.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { addPeople, missingLines, missingPeople, mergeNewPeople, newPeopleOf, parseAddArgs, REFUSED, writeCredsAtomic } from './people.mjs'

const scratch = mkdtempSync(join(tmpdir(), 'crew-people-test-'))
after(() => rmSync(scratch, { recursive: true, force: true }))

// The answer of POST /api/crews/:slug/people: the keys of the new people only, in the create answer's shape.
const answer = {
  crew: { slug: 'acme' },
  people: {
    susy: { id: 'u1', name: 'Susy Secretary', role: 'secretary', email: 'susy@acme.invalid', password: 'pw-susy', apiKey: 'arn_susy' },
    janet: { id: 'u2', name: 'Janet Janitor', role: 'janitor', email: 'janet@acme.invalid', password: 'pw-janet', apiKey: 'arn_janet' },
    // A person already there: the route does not send one, so it can never overwrite an entry.
    rita: { id: 'u3', name: 'Rita Reporter', role: 'reporter', email: 'rita@acme.invalid' }
  }
}

describe('crew people add: the merge into creds.json', () => {
  test('only people with a new key are taken from the answer', () => {
    assert.deepEqual(Object.keys(newPeopleOf(answer)).sort(), ['janet', 'susy'])
    assert.deepEqual(newPeopleOf({}), {})
    assert.deepEqual(newPeopleOf({ people: {} }), {})
  })

  test('the merge keeps every old entry and adds the new people, and names only what it added', () => {
    const creds = { base: 'https://tm.example', people: { wade: { email: 'wade@acme.invalid', password: 'old-wade', apiKey: 'arn_wade' } } }
    const { creds: merged, added } = mergeNewPeople(creds, answer)
    assert.deepEqual(added, ['janet', 'susy'])
    assert.equal(merged.base, 'https://tm.example', 'the other fields stay')
    assert.deepEqual(merged.people.wade, creds.people.wade, 'an existing entry is untouched')
    assert.deepEqual(merged.people.susy, { email: 'susy@acme.invalid', password: 'pw-susy', apiKey: 'arn_susy' })
    assert.equal(merged.people.rita, undefined, 'a person without a new key is not written')
  })

  test('an entry already in creds.json is never overwritten, even when the answer has one for that key', () => {
    const creds = { people: { susy: { email: 'old@acme.invalid', password: 'old-pw', apiKey: 'arn_old' } } }
    const { creds: merged, added } = mergeNewPeople(creds, answer)
    assert.deepEqual(merged.people.susy, { email: 'old@acme.invalid', password: 'old-pw', apiKey: 'arn_old' })
    assert.deepEqual(added, ['janet'])
  })

  test('the merge does not change the creds it was given', () => {
    const creds = { people: {} }
    mergeNewPeople(creds, answer)
    assert.deepEqual(creds, { people: {} })
  })

  test('a creds file with no people yet gets the new people', () => {
    const { creds: merged, added } = mergeNewPeople({}, answer)
    assert.deepEqual(added, ['janet', 'susy'])
    assert.deepEqual(Object.keys(merged.people).sort(), ['janet', 'susy'])
  })
})

describe('crew people add: the write', () => {
  test('the file is written in one step, mode 0600, and no temporary file is left behind', () => {
    const dir = mkdtempSync(join(scratch, 'home-'))
    const file = join(dir, 'creds.json')
    writeCredsAtomic(file, { people: { susy: { email: 'susy@acme.invalid', password: 'pw-susy', apiKey: 'arn_susy' } } })
    assert.equal(statSync(file).mode & 0o777, 0o600)
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).people.susy.apiKey, 'arn_susy')
    assert.deepEqual(readdirSync(dir), ['creds.json'], 'only the file is left in the folder')
  })

  test('an old file is replaced whole, and a write that cannot happen leaves the old file as it was', () => {
    const dir = mkdtempSync(join(scratch, 'home-'))
    const file = join(dir, 'creds.json')
    writeFileSync(file, JSON.stringify({ people: { wade: { apiKey: 'arn_wade' } } }), { mode: 0o600 })
    assert.throws(() => writeCredsAtomic(join(dir, 'missing-folder', 'creds.json'), {}))
    writeCredsAtomic(file, { people: { wade: { apiKey: 'arn_wade' }, susy: { apiKey: 'arn_susy' } } })
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(file, 'utf8')).people).sort(), ['susy', 'wade'])
  })
})

// ── The command: a fake board, no network ─────────────────────────────────

/** A fetch that answers from a list of responses, in order, and records each call. */
function fakeBoard(responses) {
  const calls = []
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body })
    const next = responses.shift()
    return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.body }
  }
  return { fetchImpl, calls }
}

const cast = { cast: [{ key: 'susy', present: true }, { key: 'janet', present: false }] }
const origin = 'http://127.0.0.1:9'
const newHome = () => mkdtempSync(join(scratch, 'crew-'))

describe('crew people add: the command', () => {
  test('no token: refused before any call, and the message names the variable, not a value', async () => {
    const { fetchImpl, calls } = fakeBoard([])
    const lines = []
    const code = await addPeople({ origin, slug: 'acme', home: newHome(), token: undefined, fetchImpl, log: l => lines.push(l) })
    assert.equal(code, 2)
    assert.equal(calls.length, 0, 'no call is made without a token')
    assert.match(lines.join('\n'), /TASKMANAGER_MANAGEMENT_TOKEN is not set/)
  })

  test('a member key or a bad token: one refusal sentence, nothing written', async () => {
    const home = newHome()
    const { fetchImpl } = fakeBoard([{ status: 403, body: {} }])
    const lines = []
    const code = await addPeople({ origin, slug: 'acme', home, token: 'tok', fetchImpl, log: l => lines.push(l) })
    assert.equal(code, 3)
    assert.deepEqual(lines, [REFUSED])
    assert.equal(readdirSync(home).length, 0, 'no creds.json is written')
  })

  test('the token goes in the Authorization header, and the body names only the people asked for', async () => {
    const { fetchImpl, calls } = fakeBoard([{ status: 200, body: { people: {} } }, { status: 200, body: cast }])
    await addPeople({ origin, slug: 'acme', home: newHome(), token: 'tok-123', people: ['susy'], fetchImpl, log: () => {} })
    assert.equal(calls[0].url, `${origin}/api/crews/acme/people`)
    assert.equal(calls[0].headers.authorization, 'Bearer tok-123')
    assert.deepEqual(JSON.parse(calls[0].body), { people: ['susy'] })
  })

  test('nobody missing: "nothing to add", the cast is printed, and creds.json is not touched', async () => {
    const home = newHome()
    writeFileSync(join(home, 'creds.json'), JSON.stringify({ people: { wade: { apiKey: 'arn_wade' } } }), { mode: 0o600 })
    const before = readFileSync(join(home, 'creds.json'), 'utf8')
    const { fetchImpl } = fakeBoard([{ status: 200, body: { people: {} } }, { status: 200, body: cast }])
    const lines = []
    const code = await addPeople({ origin, slug: 'acme', home, token: 'tok', fetchImpl, log: l => lines.push(l) })
    assert.equal(code, 0)
    assert.match(lines[0], /nothing to add/)
    assert.equal(readFileSync(join(home, 'creds.json'), 'utf8'), before)
  })

  test('new people: their keys merge in, the old entry stays, init runs, and only names are printed', async () => {
    const home = newHome()
    writeFileSync(join(home, 'creds.json'), JSON.stringify({ people: { wade: { apiKey: 'arn_wade' } } }), { mode: 0o600 })
    const added = { people: { susy: { email: 's@acme.invalid', password: 'PW-SECRET', apiKey: 'KEY-SECRET', name: 'Susy' } } }
    const { fetchImpl } = fakeBoard([{ status: 200, body: added }, { status: 200, body: cast }])
    const lines = []
    let inited = 0
    const runInit = () => {
      inited += 1
    }
    const log = line => lines.push(line)
    const code = await addPeople({ origin, slug: 'acme', home, token: 'tok', fetchImpl, runInit, log })
    assert.equal(code, 0)
    assert.equal(inited, 1, 'init runs once after the merge')
    const creds = JSON.parse(readFileSync(join(home, 'creds.json'), 'utf8'))
    assert.deepEqual(creds.people.wade, { apiKey: 'arn_wade' }, 'the old entry is untouched')
    assert.equal(creds.people.susy.apiKey, 'KEY-SECRET')
    assert.equal(statSync(join(home, 'creds.json')).mode & 0o777, 0o600)
    const printed = lines.join('\n')
    assert.match(printed, /added susy/)
    assert.match(printed, /tell Pia: new people susy/)
    assert.doesNotMatch(printed, /PW-SECRET|KEY-SECRET/, 'no key or password is printed')
  })

  test('a failure after the call but before the write names the lost people and says they cannot be fetched again', async () => {
    const home = join(scratch, 'not-a-folder', 'crew')
    const added = { people: { janet: { email: 'j@acme.invalid', password: 'PW-J', apiKey: 'KEY-J' } } }
    const { fetchImpl } = fakeBoard([{ status: 200, body: added }, { status: 200, body: cast }])
    const lines = []
    const code = await addPeople({ origin, slug: 'acme', home, token: 'tok', fetchImpl, log: l => lines.push(l) })
    assert.equal(code, 4)
    assert.match(lines[0], /janet were made on the board but could not be written/)
    assert.match(lines[0], /cannot get them again/)
    assert.doesNotMatch(lines.join('\n'), /KEY-J|PW-J/, 'no key is printed even when the write fails')
  })
})

describe('crew people add: the arguments', () => {
  test('add with a list, or with nothing, and no other verb', () => {
    assert.deepEqual(parseAddArgs(['add']), { people: null })
    assert.deepEqual(parseAddArgs(['add', '--people', 'susy, janet']), { people: ['susy', 'janet'] })
    assert.deepEqual(parseAddArgs(['add', '--people=susy']), { people: ['susy'] })
    assert.match(parseAddArgs(['remove']).error, /usage: crew people add/)
    assert.match(parseAddArgs(['add', '--people']).error, /needs a list of keys/)
  })

  test('a token on the command line is refused: it belongs in the environment', () => {
    assert.match(parseAddArgs(['add', 'arn_abc123']).error, /not on the command line/)
    assert.match(parseAddArgs(['add', '--token=x']).error, /not on the command line/)
  })
})

describe('crew update: the missing-people hint', () => {
  const cast = { cast: [{ key: 'susy', present: true }, { key: 'janet', present: false }, { key: 'pat', present: false }] }
  const board = (status, body) => async () => ({ ok: status < 300, status, json: async () => body })

  test('without a token nothing is asked, and the hint says how to check', async () => {
    assert.equal(await missingPeople({ origin: 'http://x', slug: 'acme', token: undefined, fetchImpl: () => assert.fail('asked') }), null)
    assert.match(missingLines(null)[0], /run crew people add/)
  })

  test('a cast with missing people names them and the command, and runs nothing', async () => {
    const missing = await missingPeople({ origin: 'http://x', slug: 'acme', token: 'tok', fetchImpl: board(200, cast) })
    assert.deepEqual(missing, ['janet', 'pat'])
    assert.deepEqual(missingLines(missing), ['people: this crew is missing janet, pat. To add them, run: crew people add'])
  })

  test('nobody missing prints no line; a board that cannot be asked gives the check line', async () => {
    const everyone = await missingPeople({ origin: 'http://x', slug: 'acme', token: 'tok', fetchImpl: board(200, { cast: [{ key: 'susy', present: true }] }) })
    assert.deepEqual(missingLines(everyone), [])
    assert.equal(await missingPeople({ origin: 'http://x', slug: 'acme', token: 'tok', fetchImpl: board(403, {}) }), null)
    const down = async () => {
      throw new Error('down')
    }
    assert.equal(await missingPeople({ origin: 'http://x', slug: 'acme', token: 'tok', fetchImpl: down }), null)
  })
})
