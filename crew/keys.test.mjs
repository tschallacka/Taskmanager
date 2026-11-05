// The person keys were renamed (w1..w4 to wren, wick, wynn, wade; pietje to usher). A crew home made
// before that is moved to the new keys. Run: cd crew && node --test keys.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RENAMED_KEYS, migrateCrewHome, renameKeys } from './keys.mjs'

const scratch = process.env.TMPDIR || tmpdir()
const homeWith = (files) => {
  const dir = mkdtempSync(join(scratch, 'crew-keys-'))
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), body)
  }
  return dir
}

test('the five old keys map to the new ones', () => {
  assert.deepEqual(RENAMED_KEYS, { w1: 'wren', w2: 'wick', w3: 'wynn', w4: 'wade', pietje: 'usher' })
})

test('renameKeys renames old keys, leaves others, and lets the new key win a clash', () => {
  assert.deepEqual(renameKeys({ pm: 1, w1: 2, pietje: 3 }), { pm: 1, wren: 2, usher: 3 })
  assert.deepEqual(renameKeys({ w1: 'old', wren: 'new' }), { wren: 'new' })
  assert.equal(renameKeys(undefined), undefined)
})

test('migrateCrewHome renames the creds keys and the files named for a person, once', () => {
  const dir = homeWith({
    'creds.json': JSON.stringify({ base: 'http://x', people: { pm: { apiKey: 'a' }, w1: { apiKey: 'b' }, pietje: { apiKey: 'c' } } }),
    'profiles/w1/state': 'login',
    'channel-w2.state.json': '{"last_event_id":"7"}',
    '.listen/pietje.json': '{}'
  })
  chmodSync(join(dir, 'creds.json'), 0o600)
  try {
    migrateCrewHome(dir)
    const creds = JSON.parse(readFileSync(join(dir, 'creds.json'), 'utf8'))
    assert.deepEqual(Object.keys(creds.people).sort(), ['pm', 'usher', 'wren'])
    assert.equal(creds.people.wren.apiKey, 'b')
    assert.equal(statSync(join(dir, 'creds.json')).mode & 0o777, 0o600, 'creds.json stays private')
    assert.equal(readFileSync(join(dir, 'profiles/wren/state'), 'utf8'), 'login')
    assert.equal(readFileSync(join(dir, 'channel-wick.state.json'), 'utf8'), '{"last_event_id":"7"}')
    assert.ok(existsSync(join(dir, '.listen/usher.json')))
    assert.ok(!existsSync(join(dir, 'profiles/w1')) && !existsSync(join(dir, 'channel-w2.state.json')))

    migrateCrewHome(dir)
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(dir, 'creds.json'), 'utf8')).people).sort(), ['pm', 'usher', 'wren'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('migrateCrewHome never writes over a file that is already there under the new key', () => {
  const dir = homeWith({ 'channel-w2.state.json': 'old', 'channel-wick.state.json': 'new' })
  try {
    migrateCrewHome(dir)
    assert.equal(readFileSync(join(dir, 'channel-wick.state.json'), 'utf8'), 'new')
    assert.equal(readFileSync(join(dir, 'channel-w2.state.json'), 'utf8'), 'old')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('migrateCrewHome does nothing in a folder with no creds and no person files', () => {
  const dir = homeWith({ 'crew.json': '{}' })
  try {
    migrateCrewHome(dir)
    assert.deepEqual(readFileSync(join(dir, 'crew.json'), 'utf8'), '{}')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
