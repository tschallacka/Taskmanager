// Tess Triage and Rita Reporter in the office: what each one does, from the board and the channel, and where each walks.
// Pure: no renderer, so it runs without three. Run: node --import tsx --test tests/office-roles.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FINDING_TAGS, SORTING_TABLE, isOpenFinding, tessPlan, tessStateOf } from '../app/office/roles/tess'
import { MEETING_OVER, STATUS_EVERY_MS, TYPEWRITER, closesMeeting, ritaPlan, ritaStateOf, statusDue } from '../app/office/roles/rita'

test('a finding is a card with a reviewer violation or a bug tag, until it is triaged', () => {
  for (const tag of FINDING_TAGS) assert.equal(isOpenFinding([tag]), true, `${tag} is a finding`)
  assert.equal(isOpenFinding(['ux violation', 'triaged']), false, 'a triaged finding is out of the pile')
  assert.equal(isOpenFinding(['pm approved']), false, 'an approval is not a finding')
  assert.equal(isOpenFinding([]), false)
})

test('Tess sorts while any open finding is on the board, and is off duty when the pile is empty', () => {
  assert.equal(tessStateOf([[], ['bug']]), 'sort')
  assert.equal(tessStateOf([['cq violation', 'triaged'], ['verify ux']]), null, 'all triaged or not a finding')
  assert.equal(tessStateOf([]), null)
})

test('Tess\'s walk goes to the sorting table and stands there, and only while she sorts', () => {
  assert.deepEqual(tessPlan('sort'), { points: [SORTING_TABLE], then: 'stand' })
  assert.equal(tessPlan(null), null)
})

test('a status report is due once an hour, or before the first one', () => {
  const now = 10 * STATUS_EVERY_MS
  assert.equal(statusDue(null, now), true, 'no report yet')
  assert.equal(statusDue(now - STATUS_EVERY_MS + 1, now), false, 'one minute short of an hour is not due')
  assert.equal(statusDue(now - STATUS_EVERY_MS, now), true, 'an hour since the last report is due')
})

test('minutes are owed from a line that says "meeting over:", in any case', () => {
  assert.equal(closesMeeting('Meeting Over: ship it'), true)
  assert.equal(MEETING_OVER, 'meeting over:')
  assert.equal(closesMeeting('meeting over: we ship on friday'), true)
  assert.equal(closesMeeting('we will meet later'), false)
})

test('Rita types while minutes are owed or a report is due, and is off duty otherwise', () => {
  const now = 10 * STATUS_EVERY_MS
  assert.equal(ritaStateOf({ lastReportAt: now - 1000, minutesOwed: 1, now }), 'type', 'minutes owed')
  assert.equal(ritaStateOf({ lastReportAt: now - STATUS_EVERY_MS, minutesOwed: 0, now }), 'type', 'report due')
  assert.equal(ritaStateOf({ lastReportAt: now - 1000, minutesOwed: 0, now }), null)
})

test('Rita\'s walk goes to the typewriter and stands there, and only while she types', () => {
  assert.deepEqual(ritaPlan('type'), { points: [TYPEWRITER], then: 'stand' })
  assert.equal(ritaPlan(null), null)
})

test('the two desks are not the same place', () => {
  assert.notDeepEqual(SORTING_TABLE, TYPEWRITER)
})
