// crew-defaults: reader and devServers default from the crew's people keys, and a field already set is kept.
//   node --test crew/crew-defaults.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crewDefaults, withCrewDefaults } from './crew-defaults.mjs'

test('the reader is pia when she is a person, and she gets 3100; the others follow in order from 3101', () => {
  const d = crewDefaults(['wren', 'pia', 'wick'])
  assert.equal(d.reader, 'pia')
  assert.deepEqual(d.devServers, { pia: 3100, wren: 3101, wick: 3102 })
})

test('without pia the first key is the reader, and it gets 3100', () => {
  const d = crewDefaults(['wren', 'wick'])
  assert.equal(d.reader, 'wren')
  assert.deepEqual(d.devServers, { wren: 3100, wick: 3101 })
})

test('no people: no reader and no dev servers', () => {
  assert.deepEqual(crewDefaults([]), { reader: null, devServers: {} })
})

test('a crew.json missing both fields gets both; the fields it has are kept', () => {
  const filled = withCrewDefaults({ team: 'Acme' }, ['pia', 'wren'])
  assert.equal(filled.crew.reader, 'pia')
  assert.deepEqual(filled.crew.devServers, { pia: 3100, wren: 3101 })
  assert.deepEqual(filled.added, ['reader', 'devServers'])
  const kept = withCrewDefaults({ reader: 'wren', devServers: { wren: 3999 } }, ['pia', 'wren'])
  assert.equal(kept.crew.reader, 'wren')
  assert.deepEqual(kept.crew.devServers, { wren: 3999 })
  assert.deepEqual(kept.added, [])
})

test('a crew.json with only a reader gets only the dev servers', () => {
  const partial = withCrewDefaults({ reader: 'pia' }, ['pia', 'nina'])
  assert.equal(partial.crew.reader, 'pia')
  assert.deepEqual(partial.crew.devServers, { pia: 3100, nina: 3101 })
  assert.deepEqual(partial.added, ['devServers'])
})
