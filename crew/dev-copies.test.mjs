// crew dev-copies: for each card in Verify UX or Verify QA, whether its owner's copy answers, and one line asking Boss
// for each copy that does not. The board read and the probe are injected, so no real port is touched and nothing is
// started. Run:
//   node --test crew/dev-copies.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gateCards, branchOf, copyLines, workingBoardId } from './dev-copies.mjs'

test('the board is the working board from crew.json, not the crew-home board', () => {
  assert.equal(workingBoardId({ board: { name: 'x', url: 'https://taskmanager.tschallacka.dev/projects/mw7vn0cp9pspxfvjru' } }), 'mw7vn0cp9pspxfvjru')
  assert.throws(() => workingBoardId({}), /working board cannot be read/)
  assert.throws(() => workingBoardId({ board: { url: 'https://example.test/nothing' } }), /working board cannot be read/)
})

test('a board read with no gate column is an error, not an empty list', () => {
  assert.throws(() => gateCards({ id: 'mw7', name: 'Other', columns: [{ name: 'Done', tasks: [] }] }, keyOf), /no Verify UX or Verify QA column/)
})

const keyOf = name => ({ 'Wren Worker': 'wren', 'Wynn Worker': 'wynn', 'Wade Worker': 'wade' })[name]

function board(columns) {
  return { columns: columns.map(([name, tasks, taskCount]) => ({ name, tasks, taskCount: taskCount ?? tasks.length })) }
}

test('only the cards in Verify UX or Verify QA are gate cards, each with its owner key', () => {
  const b = board([
    ['In progress', [{ id: 'c2', title: 'B', assignee: 'Wick Worker' }]],
    ['Verify QA', [{ id: 'c1', title: 'A', assignee: 'Wren Worker' }]],
    ['Verify UX', [{ id: 'c3', title: 'C', assignee: 'Wynn Worker' }]],
    ['Verify PM', [{ id: 'c5', title: 'E', assignee: 'Wade Worker' }]]
  ])
  const { cards, cut } = gateCards(b, keyOf)
  assert.deepEqual(cards.map(c => [c.id, c.who, c.column]), [['c1', 'wren', 'Verify QA'], ['c3', 'wynn', 'Verify UX']])
  assert.deepEqual(cut, [])
})

test('a gate column with more cards than it shows is reported as cut, with its shown and total counts', () => {
  const b = board([['Verify QA', [{ id: 'c1', title: 'A', assignee: 'Wren Worker' }], 73]])
  const { cards, cut } = gateCards(b, keyOf)
  assert.equal(cards.length, 1)
  assert.deepEqual(cut, [{ column: 'Verify QA', shown: 1, total: 73 }])
})

test('an owner with no crew key is kept by name, not dropped', () => {
  const b = board([['Verify UX', [{ id: 'c9', title: 'Z', assignee: 'Nobody Known' }]]])
  const { cards } = gateCards(b, keyOf)
  assert.equal(cards[0].who, 'Nobody Known')
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
