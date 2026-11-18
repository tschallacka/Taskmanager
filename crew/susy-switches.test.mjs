// Susy daemon (card mwf201blsqvx3jczev): each dispatch kill switch in crew.json is named in the charter, and the daemon reads it.
// Source level. Run: node --test crew/susy-switches.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(`./${path}`, import.meta.url), 'utf8')
const SWITCHES = ['gateWakes', 'nextCard', 'reviewNeeds']

test('the charter names each dispatch switch, as susy.dispatch.<name>', () => {
  const charter = read('SUSY.md.tmpl')
  for (const name of SWITCHES) {
    assert.ok(charter.includes(`susy.dispatch.${name}`), `the charter names susy.dispatch.${name}`)
  }
})

test('the charter says the switches are off by default and that dry-run comes first', () => {
  const charter = read('SUSY.md.tmpl')
  assert.match(charter, /Dispatch switches/)
  assert.match(charter, /off by default/)
  assert.match(charter, /dry-run/)
})

test('the daemon reads each switch from crew.json, as a strict true', () => {
  const daemon = read('susy-daemon.mjs')
  for (const name of SWITCHES) {
    assert.ok(daemon.includes(`susy?.dispatch?.${name} === true`), `the daemon reads susy.dispatch.${name} as true`)
  }
})
