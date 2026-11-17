// Which day a logged time belongs to (card mwj6tfijrwm88ur7iaf). The server takes an entry's day from the request; when a
// request sends none, it uses the UTC date, which is the wrong day for a person far from UTC (a Sunday evening in New York
// is Monday in UTC, so the entry moves a week). Every call the browser makes for time must send the person's local day.
// Run:
//   node --import tsx --test tests/time-log-day.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { todayIso } from '../app/utils/dueDate'

process.env.TZ = 'America/New_York'

const read = (path: string) => readFileSync(join(import.meta.dirname, '..', path), 'utf8')

test('the local day is the day on the clock where the person is: a Sunday evening in New York is still Sunday', () => {
  // 2026-11-09 02:30 UTC is 2026-11-08 21:30 in New York (EST, UTC-5).
  assert.equal(todayIso(new Date('2026-11-09T02:30:00Z')), '2026-11-08')
})

test('the list row logs a manual time with the local day, not only the minutes', () => {
  const row = read('app/components/kanban/ListRowMeta.vue')
  assert.match(row, /\/api\/tasks\/\$\{props\.task\.id\}\/time`, \{ method: 'POST', headers: realtimeHeaders\(\), body: \{ minutes, day: todayIso\(\) \} \}/)
})

test('the timesheet logs a manual time with the local day', () => {
  assert.match(read('app/pages/projects/timesheet.vue'), /body: \{ minutes, day: day\.value \|\| todayIso\(\), note: note\.value \}/)
})

test('the timer starts and stops with the local day', () => {
  const timer = read('app/composables/useTimeTracking.ts')
  assert.match(timer, /body: \{ taskId, day: todayIso\(\) \}/)
  assert.match(timer, /query: \{ day: todayIso\(\) \}/)
})
