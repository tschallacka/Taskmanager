// The typed board id for "Set up a crew" on the Crews page (card mwdd5q94mmq78py1ntp, option b). Pure.
// Run: node --import tsx --test tests/approval-setup-board.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setupBoardProblem } from '../app/utils/approvalSetupBoard'

test('a usable board id gives no problem', () => {
  assert.equal(setupBoardProblem({ boardId: 'mw7vn0cp9pspxfvjru' }), null)
})

test('an empty board id and a bad board id each give one sentence', () => {
  assert.equal(setupBoardProblem({ boardId: '  ' }), 'Type the board id first.')
  assert.match(setupBoardProblem({ boardId: 'bad id!' }) ?? '', /^A board id is letters, digits/)
})
