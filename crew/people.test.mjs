// `crew people add`, the merge into creds.json (card mw9m0rwynhwj8y2odd, step 1). Temp folders only, no network.
// Run from the repo root: node --test crew/people.test.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { mergeNewPeople, newPeopleOf, writeCredsAtomic } from './people.mjs'

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
