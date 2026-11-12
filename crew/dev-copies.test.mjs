// crew dev-copies: for each card in Verify UX or Verify QA, whether its owner's copy answers, and one line asking Boss
// for each copy that does not. The probe is injected, so no real port is touched and nothing is started. Run:
//   node --test crew/dev-copies.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { qaCards, branchOf, copyLines } from './dev-copies.mjs'

test('only a card in Verify UX or Verify QA is checked', () => {
  const briefs = [
    { who: 'wren', blocks: [{ id: 'c1', title: 'A', column: 'Verify QA' }] },
    { who: 'wick', blocks: [{ id: 'c2', title: 'B', column: 'In progress' }] },
    { who: 'wynn', blocks: [{ id: 'c3', title: 'C', column: 'Verify UX' }, { id: 'c4', title: 'D', column: 'To do' }] },
    { who: 'wade', blocks: [{ id: 'c5', title: 'E', column: 'Verify PM' }] }
  ]
  assert.deepEqual(qaCards(briefs).map(c => c.id), ['c1', 'c3'])
})

test('the branch comes from the card\'s linked GitHub item', () => {
  assert.equal(branchOf({ github: [{ branch: 'wren/x' }] }), 'wren/x')
  assert.equal(branchOf({ github: [{ pullRequest: { branch: 'wick/y' } }] }), 'wick/y')
  assert.equal(branchOf({ github: [] }), null)
  assert.equal(branchOf({}), null)
})

test('a copy that answers is reported up; nothing is asked of Boss', () => {
  const cards = [{ who: 'wren', id: 'c1', column: 'Verify QA' }]
  const result = copyLines(cards, { probe: port => port === 3101, branches: { c1: 'wren/x' } })
  assert.deepEqual(result.lines, ['wren: card c1 [Verify QA] branch wren/x on :3101: up'])
  assert.equal(result.ok, true)
})

test('a copy that does not answer gets the line asking Boss to start it, and nothing is started', () => {
  const cards = [{ who: 'wynn', id: 'c3', column: 'Verify UX' }]
  const result = copyLines(cards, { probe: () => false, branches: { c3: 'wynn/z' } })
  assert.equal(result.ok, false)
  assert.equal(result.lines[0], 'wynn: card c3 [Verify UX] branch wynn/z on :3103: not up')
  assert.equal(result.lines[1], 'no copy: ask Boss: tester-copy.sh start wynn wynn/z')
})

test('a card with no branch or no port is reported, not guessed', () => {
  const noBranch = copyLines([{ who: 'wade', id: 'c5', column: 'Verify QA' }], { probe: () => true, branches: {} })
  assert.equal(noBranch.ok, false)
  assert.match(noBranch.lines[0], /no branch linked to the card/)
  const noPort = copyLines([{ who: 'usher', id: 'c6', column: 'Verify UX' }], { probe: () => true, branches: { c6: 'u/q' } })
  assert.equal(noPort.ok, false)
  assert.match(noPort.lines[0], /no port for usher/)
})
