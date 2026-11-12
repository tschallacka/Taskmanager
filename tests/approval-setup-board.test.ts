// The typed board for "Set up a crew" on the Crews page (card mwdd5q94mmq78py1ntp, option b). Pure.
// Run: node --import tsx --test tests/approval-setup-board.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setupBoardProblem } from '../app/utils/approvalSetupBoard'

test('a usable board id and name give no problem', () => {
  assert.equal(setupBoardProblem({ boardId: 'mw7vn0cp9pspxfvjru', boardName: 'Taskmanager Maintenance (crew)' }), null)
})

test('an empty board id, a bad board id, and an empty name each give one sentence', () => {
  assert.equal(setupBoardProblem({ boardId: '  ', boardName: 'Board' }), 'Type the board id first.')
  assert.match(setupBoardProblem({ boardId: 'bad id!', boardName: 'Board' }) ?? '', /^A board id is letters, digits/)
  assert.equal(setupBoardProblem({ boardId: 'abcd', boardName: ' ' }), 'Type the board name too.')
})

test('a board name over 120 characters is refused', () => {
  assert.equal(setupBoardProblem({ boardId: 'abcd', boardName: 'x'.repeat(121) }), 'The board name is at most 120 characters.')
})
