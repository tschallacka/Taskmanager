import { test } from 'node:test'
import assert from 'node:assert/strict'
import { takeNotes, migrateNotes, NOTE_MAX_AGE_MS } from './listen-notes.mjs'

const NOW = Date.parse('2026-11-12T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const note = (id, ageMs, extra = {}) => ({ id, type: 'comment', title: `note ${id}`, body: '', at: new Date(NOW - ageMs).toISOString(), read: false, ...extra })

test('301 old notes are not announced, and the state keeps none of them', () => {
  const old = Array.from({ length: 301 }, (_, i) => note(`old${i}`, 20 * DAY + i))
  const { announce, notes } = takeNotes({}, old, NOW)
  assert.equal(announce.length, 0)
  assert.deepEqual(notes, {})
})

test('301 old notes are not re-announced when a listener starts again with the state it kept', () => {
  const old = Array.from({ length: 301 }, (_, i) => note(`old${i}`, 20 * DAY + i))
  const first = takeNotes({}, old, NOW)
  const again = takeNotes(first.notes, old, NOW + 60_000)
  assert.equal(again.announce.length, 0)
})

test('a new note is announced once, then not again', () => {
  const fresh = [note('new1', 60_000)]
  const first = takeNotes({}, fresh, NOW)
  assert.deepEqual(first.announce.map(n => n.id), ['new1'])
  const second = takeNotes(first.notes, fresh, NOW + 5_000)
  assert.equal(second.announce.length, 0)
})

test('a note already read is never announced', () => {
  const { announce } = takeNotes({}, [note('r1', 60_000, { read: true })], NOW)
  assert.equal(announce.length, 0)
})

test('the cap is by age, not by count: 400 recent notes are all kept until they age out', () => {
  const recent = Array.from({ length: 400 }, (_, i) => note(`r${i}`, DAY + i))
  const { announce, notes } = takeNotes({}, recent, NOW)
  assert.equal(announce.length, 400)
  assert.equal(Object.keys(notes).length, 400)
})

test('a kept id older than the cap is dropped from the state', () => {
  const { notes } = takeNotes({ gone: NOW - NOTE_MAX_AGE_MS - 1, kept: NOW - DAY }, [], NOW)
  assert.deepEqual(Object.keys(notes), ['kept'])
})

test('the old file that kept a list of ids is read as seen, and those notes are not announced', () => {
  const ids = Array.from({ length: 300 }, (_, i) => `id${i}`)
  const migrated = migrateNotes(ids, NOW)
  assert.equal(Object.keys(migrated).length, 300)
  const { announce } = takeNotes(ids, ids.map(id => note(id, 60_000)), NOW)
  assert.equal(announce.length, 0)
})
