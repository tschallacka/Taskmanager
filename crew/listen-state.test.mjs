// The listen loop's state file (listen-state.mjs): a file with no notes list, or with a list of the wrong shape, reads as
// empty instead of crashing the loop (the bug on mw8bk9sgefuxh9twxe: Susy's .listen/susy.json had no "notes").
// Run from the repo root: node --test crew/listen-state.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeListenState, parseListenState } from './listen-state.mjs'

test('a state file with no notes list reads as an empty list, and the loop can add to it', () => {
  // The file that crashed the loop: Susy's state, written without "notes".
  const state = parseListenState('{"joined":true,"tasks":{"mw1":"Ship it"}}')
  assert.deepEqual(state.notes, [])
  // The loop's own steps: a new note is looked up, then pushed, without a crash.
  assert.equal(state.notes.includes('n1'), false)
  state.notes.push('n1')
  assert.deepEqual(state.notes, ['n1'])
  assert.equal(state.joined, true)
  assert.deepEqual(state.tasks, { mw1: 'Ship it' })
})

test('a notes list of the wrong shape is read as empty, and its non-text entries are dropped', () => {
  assert.deepEqual(parseListenState('{"notes":"n1"}').notes, [])
  assert.deepEqual(parseListenState('{"notes":{"n1":true}}').notes, [])
  assert.deepEqual(parseListenState('{"notes":["n1",7,null,"n2"]}').notes, ['n1', 'n2'])
})

test('a tasks value that is not an object reads as not yet read (null)', () => {
  assert.equal(parseListenState('{"notes":[]}').tasks, null)
  assert.equal(parseListenState('{"tasks":["mw1"]}').tasks, null)
  assert.equal(parseListenState('{"tasks":"mw1"}').tasks, null)
  assert.equal(parseListenState('{"tasks":null}').tasks, null)
})

test('joined is true only when the file says so', () => {
  assert.equal(parseListenState('{}').joined, false)
  assert.equal(parseListenState('{"joined":"yes"}').joined, false)
  assert.equal(parseListenState('{"joined":true}').joined, true)
})

test('a file that is not JSON, or not an object, reads as the empty state', () => {
  const empty = { joined: false, notes: [], tasks: null }
  assert.deepEqual(parseListenState('not json {'), empty)
  assert.deepEqual(parseListenState('null'), empty)
  assert.deepEqual(parseListenState('[1,2]'), empty)
  assert.deepEqual(parseListenState(''), empty)
})

test('a good state is kept as it is', () => {
  const good = { joined: true, notes: ['n1', 'n2'], tasks: { mw1: 'Ship it' }, extra: 'kept' }
  assert.deepEqual(normalizeListenState(good), good)
})
