// The board page's load failures: a bad id, a board the reader cannot open, a request that never completes. No spinner
// that spins forever. Pure, plus two source checks on the store and the page. Run:
//   node --import tsx --test tests/board-load.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BOARD_LOAD_TIMEOUT_MS, boardLoadMessage, isBoardId, withTimeout } from '../app/utils/boardLoad'

test('a board id is letters and digits only; anything else is not a valid board link', () => {
  assert.equal(isBoardId('seedcrewboard'), true)
  assert.equal(isBoardId('mw7vn0cp9pspxfvjru'), true)
  assert.equal(isBoardId('seedcrew-board'), false)
  assert.equal(isBoardId('a/b'), false)
  assert.equal(boardLoadMessage({ invalidId: true }), 'This is not a valid board link.')
})

test('a board the reader cannot open, or that does not exist, says so', () => {
  assert.equal(boardLoadMessage({ status: 404 }), 'You do not have access to this board or it does not exist.')
  assert.equal(boardLoadMessage({ status: 403 }), 'You do not have access to this board or it does not exist.')
})

test('any other failure, or a request that never completes, says the board could not be loaded', () => {
  assert.equal(boardLoadMessage({ status: 500 }), 'This board could not be loaded.')
  assert.equal(boardLoadMessage({ status: null }), 'This board could not be loaded.')
  assert.equal(BOARD_LOAD_TIMEOUT_MS, 60_000)
})

test('withTimeout rejects a request that never completes, and passes a fast one through', async () => {
  const never = new Promise<string>(() => {})
  await assert.rejects(withTimeout(never, 20), /timed out/)
  assert.equal(await withTimeout(Promise.resolve('board'), 1000), 'board')
})

test('the store gives the board request a timeout', () => {
  const store = readFileSync(new URL('../app/composables/useProjects.ts', import.meta.url), 'utf8')
  assert.match(store, /withTimeout\(\$fetch<BoardPayload>\(boardUrl\(id\)\), BOARD_LOAD_TIMEOUT_MS\)/)
})

test('the page shows the sentence with Try again and Back to boards, never the spinner, after a failure', () => {
  const page = readFileSync(new URL('../app/pages/projects/[id].vue', import.meta.url), 'utf8')
  assert.match(page, /boardLoadMessage\(/)
  assert.match(page, /label="Try again"/)
  assert.match(page, /label="Back to boards"/)
  assert.match(page, /isBoardId\(id\)/)
})
