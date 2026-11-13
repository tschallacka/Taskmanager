// The home page's numbers (redesign 6/9): due today, overdue and done this week, counted from the tasks the app already
// has, for one person. Pure, so it runs without a browser. Run:
//   node --import tsx --test tests/home-stats.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { homeStats } from '../app/utils/homeStats'

const me = 'user-me'
const today = '2026-11-12'
// Monday 9 November 2026, local midnight: the start of this week.
const weekStart = new Date(2026, 10, 9).getTime()
const day = (offset: number) => {
  const d = new Date(2026, 10, 12 + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const task = (id: string, extra: Record<string, unknown> = {}) => ({ id, assigneeId: me, dueOn: null, completedAt: null, ...extra })

test('due today counts open tasks due today, for this person only', () => {
  const tasks = [
    task('a', { dueOn: today }),
    task('b', { dueOn: today, completedAt: weekStart + 1000 }),
    task('c', { dueOn: day(1) }),
    task('d', { dueOn: today, assigneeId: 'someone-else' })
  ]
  assert.equal(homeStats(tasks, me, today, weekStart).dueToday, 1)
})

test('overdue counts open tasks due before today; a done task is not overdue', () => {
  const tasks = [
    task('a', { dueOn: day(-1) }),
    task('b', { dueOn: day(-3), completedAt: weekStart + 1000 }),
    task('c', { dueOn: today }),
    task('d', { dueOn: null })
  ]
  assert.equal(homeStats(tasks, me, today, weekStart).overdue, 1)
})

test('done this week counts tasks finished since Monday, not before', () => {
  const tasks = [
    task('a', { completedAt: weekStart }),
    task('b', { completedAt: weekStart + 5 * 86_400_000 }),
    task('c', { completedAt: weekStart - 1 }),
    task('d', { completedAt: weekStart + 1, assigneeId: 'someone-else' })
  ]
  assert.equal(homeStats(tasks, me, today, weekStart).doneThisWeek, 2)
})

test('a brand new account gets zeros, not an invented number', () => {
  assert.deepEqual(homeStats([], me, today, weekStart), { dueToday: 0, overdue: 0, doneThisWeek: 0 })
})
