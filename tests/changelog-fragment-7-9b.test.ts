// The changelog fragment for card 7/9b (changelog.d/mwd8xst0vw3mwpx2tq-redesign-7-9b.md): one bullet, in the form
// CONTRIBUTING.md asks for, naming the card's files. Run: node --import tsx --test tests/changelog-fragment-7-9b.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const path = new URL('../changelog.d/mwd8xst0vw3mwpx2tq-redesign-7-9b.md', import.meta.url)

test('the fragment exists and holds one bullet in the form "- **Title.** What changed, then the files."', () => {
  assert.ok(existsSync(path), 'the fragment file')
  const text = readFileSync(path, 'utf8')
  assert.equal(text.split('\n').filter(line => line.trim() !== '').length, 1, 'one bullet')
  assert.match(text, /^- \*\*[^*]+\.\*\* .+/)
})

test('the bullet names the files it changed', () => {
  const text = readFileSync(path, 'utf8')
  assert.match(text, /app\/components\/kanban\/ProjectCalendarView\.vue/)
  assert.match(text, /app\/components\/kanban\/ProjectTimelineView\.vue/)
  assert.match(text, /app\/pages\/projects\/\[id\]\.vue/)
  assert.match(text, /app\/utils\/calendarKeys\.ts/)
})
