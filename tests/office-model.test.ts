// The office view's choreography: which trip each board change becomes, who makes it, and what
// everyone does in between. Pure; needs no database. Run:
//   node --import tsx --test tests/office-model.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  activityOf, castWithStandIns, describeErrand, errandsBetween, officePath, pingsBetween, placeOf, stageOf
} from '../shared/office/model'
import type { OfficePerson, OfficeSnapshot, OfficeTask, Stage } from '../shared/office/model'
import { DEMO_CAST, DEMO_SCRIPT, DemoBoard } from '../shared/office/demo'

const cast = DEMO_CAST
const user = (key: string) => cast.find(p => p.key === key)!.userId

function task(id: string, stage: Stage, assignee?: string, extra: Partial<OfficeTask> = {}): OfficeTask {
  return { id, title: id, stage, column: stage, assigneeId: assignee ? user(assignee) : null, completed: false, blocked: false, comments: 0, ...extra }
}

function snap(tasks: OfficeTask[], people: OfficePerson[] = cast): OfficeSnapshot {
  return { boardId: 'b', boardName: 'B', crewName: null, cast: people, tasks }
}

function only(prev: OfficeTask[], next: OfficeTask[], people: OfficePerson[] = cast) {
  const errands = errandsBetween(snap(prev, people), snap(next, people))
  assert.equal(errands.length, 1, JSON.stringify(errands))
  return errands[0]!
}

test('column names map to stages, unknown ones to other', () => {
  assert.equal(stageOf('To do'), 'todo')
  assert.equal(stageOf(' In progress '), 'doing')
  assert.equal(stageOf('Verify'), 'verify-boss')
  assert.equal(stageOf('Verify QA'), 'verify-qa')
  assert.equal(stageOf('Someday'), 'other')
})

test('the first look at a board plays nothing: folders are simply where they are', () => {
  assert.deepEqual(errandsBetween(null, snap([task('a', 'doing', 'wren')])), [])
})

test('a new backlog task comes in the courier\'s parcel, and the Boss carries it to Pia', () => {
  const e = only([], [task('a', 'backlog')])
  assert.deepEqual([e.kind, e.courier, e.from, e.to], ['arrive', 'boss', 'tube', 'pia:backlog'])
  assert.match(describeErrand(e, castWithStandIns(cast)), /courier brings .* Cato unpacks it for Pia/)
})

test('a new task straight into a worker\'s todo is also unpacked by the Boss, who takes it to the worker', () => {
  const e = only([], [task('a', 'todo', 'wick')])
  assert.deepEqual([e.kind, e.courier, e.to], ['arrive', 'boss', 'wick:todo'])
})

test('assigning: Pia carries the folder from her backlog to the worker\'s todo tray', () => {
  const e = only([task('a', 'backlog')], [task('a', 'todo', 'wren')])
  assert.deepEqual([e.kind, e.courier, e.from, e.to], ['assign', 'pia', 'pia:backlog', 'wren:todo'])
})

test('starting: the worker takes the folder from the tray to the desk', () => {
  const e = only([task('a', 'todo', 'wren')], [task('a', 'doing', 'wren')])
  assert.deepEqual([e.kind, e.courier, e.to], ['start', 'wren', 'wren:desk'])
})

test('handing in: the worker walks the folder to Pia\'s verify inbox', () => {
  const e = only([task('a', 'doing', 'wren')], [task('a', 'verify-pm', 'wren')])
  assert.deepEqual([e.kind, e.courier, e.to], ['hand-in', 'wren', 'pia:verify'])
})

test('passing on: every gate goes through Pia, who takes it to the reviewer and fetches it back', () => {
  const e1 = only([task('a', 'verify-pm')], [task('a', 'verify-ux')])
  assert.deepEqual([e1.kind, e1.courier, e1.to], ['pass-on', 'pia', 'usher:review'])
  const e2 = only([task('a', 'verify-ux')], [task('a', 'verify-pm')])
  assert.deepEqual([e2.kind, e2.courier, e2.to], ['pass-on', 'usher', 'pia:verify'])
  const e3 = only([task('a', 'verify-pm')], [task('a', 'verify-boss')])
  assert.deepEqual([e3.courier, e3.to], ['pia', 'boss:inbox'])
})

test('rejecting: Pia carries the folder back to the worker; the Boss sends it back to Pia, not to a worker', () => {
  const e = only([task('a', 'verify-pm', 'wren')], [task('a', 'todo', 'wren')])
  assert.deepEqual([e.kind, e.courier, e.to], ['reject', 'pia', 'wren:todo'])
  const b = only([task('a', 'verify-boss')], [task('a', 'backlog')])
  assert.deepEqual([b.kind, b.courier, b.to], ['reject', 'boss', 'pia:backlog'])
})

test('reassigning between workers: Pia fetches it, not either worker', () => {
  const e = only([task('a', 'todo', 'wick')], [task('a', 'todo', 'wade')])
  assert.deepEqual([e.kind, e.courier, e.from, e.to], ['reassign', 'pia', 'wick:todo', 'wade:todo'])
})

test('blocking and unblocking go through the shelf', () => {
  const b = only([task('a', 'doing', 'wick')], [task('a', 'blocked', 'wick')])
  assert.deepEqual([b.kind, b.courier, b.to], ['block', 'wick', 'shelf:blocked'])
  const u = only([task('a', 'blocked', 'wick')], [task('a', 'todo', 'wick')])
  assert.deepEqual([u.kind, u.courier, u.to], ['unblock', 'pia', 'wick:todo'])
})

test('bugs, shipping, done and deleting each have their fixture', () => {
  assert.equal(only([task('a', 'verify-qa')], [task('a', 'bugs')]).kind, 'bug')
  const ship = only([task('a', 'verify-boss')], [task('a', 'ready')])
  assert.deepEqual([ship.kind, ship.courier], ['ship', 'boss'])
  assert.equal(only([task('a', 'ready')], [task('a', 'done')]).kind, 'done')
  const del = only([task('a', 'backlog')], [])
  assert.deepEqual([del.kind, del.courier, del.to], ['delete', 'pia', 'shredder'])
})

test('a review column without its reviewer falls back to Pia\'s verify inbox', () => {
  const small = cast.filter(p => p.key !== 'usher')
  assert.equal(placeOf(task('a', 'verify-ux'), small), 'pia:verify')
})

test('a board without a Pia or a Boss still gets both, as stand-ins', () => {
  const keys = castWithStandIns([{ userId: 'x', key: 'u-x', name: 'Someone', role: 'worker' }]).map(p => p.key)
  assert.deepEqual(keys, ['pia', 'u-x', 'boss'])
})

test('a todo task without a worker stays in Pia\'s backlog', () => {
  assert.equal(placeOf(task('a', 'todo'), cast), 'pia:backlog')
  assert.equal(placeOf(task('a', 'todo', 'pia'), cast), 'pia:backlog')
})

test('activity follows where the folders lie', () => {
  const wren = cast.find(p => p.key === 'wren')!
  assert.equal(activityOf(wren, []), 'idle')
  assert.equal(activityOf(wren, ['wren:todo']), 'eyeing-todo')
  assert.equal(activityOf(wren, ['wren:todo', 'wren:desk']), 'working')
  const pia = cast.find(p => p.key === 'pia')!
  assert.equal(activityOf(pia, ['pia:backlog']), 'sorting')
  assert.equal(activityOf(pia, ['pia:backlog', 'pia:verify']), 'triaging')
  const nina = cast.find(p => p.key === 'nina')!
  assert.equal(activityOf(nina, ['nina:review']), 'reviewing')
})

test('comments and ticks become pings where the folder lies', () => {
  const pings = pingsBetween(snap([task('a', 'doing', 'wren')]), snap([task('a', 'doing', 'wren', { comments: 2, completed: true })]))
  assert.deepEqual(pings.map(p => [p.kind, p.place]), [['comment', 'wren:desk'], ['completed', 'wren:desk']])
})

test('the demo script plays every kind of trip the office knows', () => {
  const board = new DemoBoard(() => 0.5)
  let prev = board.snapshot()
  const kinds = new Set<string>()
  for (let i = 0; i < DEMO_SCRIPT.length; i++) {
    const next = board.advance()
    for (const e of errandsBetween(prev, next)) kinds.add(e.kind)
    prev = next
  }
  for (const kind of ['arrive', 'assign', 'start', 'hand-in', 'pass-on', 'reject', 'reassign', 'block', 'unblock', 'bug', 'ship', 'done', 'delete']) {
    assert.ok(kinds.has(kind), `the demo never plays ${kind}`)
  }
})

test('the demo sends everything through Pia: no folder goes from one reviewer to another, or from a reviewer to a worker', () => {
  let seed = 11
  const board = new DemoBoard(() => ((seed = (seed * 16807) % 2147483647) / 2147483647))
  let prev = board.snapshot()
  const gates = new Set(['usher:review', 'nina:review', 'quincy:review'])
  const trips: string[] = []
  for (let i = 0; i < DEMO_SCRIPT.length + 600; i++) {
    const next = board.advance()
    for (const e of errandsBetween(prev, next)) {
      const trip = `${e.from} -> ${e.to}`
      if (gates.has(e.from) && e.to !== 'pia:verify') trips.push(trip)
      if (gates.has(e.to) && e.from !== 'pia:verify') trips.push(trip)
      if (e.to === 'boss:inbox' && e.from !== 'pia:verify') trips.push(trip)
      if (e.from === 'boss:inbox' && e.to.endsWith(':todo')) trips.push(trip)
    }
    prev = next
  }
  assert.deepEqual(trips, [])
})

test('after the script the demo keeps moving and never strands a folder', () => {
  let seed = 7
  const board = new DemoBoard(() => ((seed = (seed * 16807) % 2147483647) / 2147483647))
  let prev = board.snapshot()
  for (let i = 0; i < DEMO_SCRIPT.length + 200; i++) {
    const next = board.advance()
    for (const e of errandsBetween(prev, next)) assert.notEqual(e.from, e.to)
    prev = next
  }
  assert.ok(prev.tasks.length > 0)
})

test('a board links to its office by one path, whatever characters its id has', () => {
  assert.equal(officePath('mw3no6i1vvfb9t9b6gm'), '/office/mw3no6i1vvfb9t9b6gm')
  assert.equal(officePath('demo'), '/office/demo')
  // An id is never trusted to be path-safe.
  assert.equal(officePath('a/b c?d'), '/office/a%2Fb%20c%3Fd')
})
