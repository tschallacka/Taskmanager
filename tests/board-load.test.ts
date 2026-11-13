// The board page's load failures: a bad id, a board the reader cannot open, a request that never completes. No spinner
// that spins forever. Pure, plus two source checks on the store and the page. Run:
//   node --import tsx --test tests/board-load.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BOARD_LOAD_TIMEOUT_MS, boardLoadMessage, boardLoadStateAfter, isBoardId, withTimeout } from '../app/utils/boardLoad'

test('the store sets the load error on a failure, and clears it on a retry or a load', () => {
  const failed = boardLoadStateAfter(null, { type: 'fail', status: 404 })
  assert.deepEqual(failed, { status: 404, invalidId: false, message: 'You do not have access to this board or it does not exist.' })
  assert.equal(boardLoadStateAfter(failed, { type: 'retry' }), null, 'a retry clears the error while it loads again')
  assert.equal(boardLoadStateAfter(failed, { type: 'loaded' }), null, 'a load that succeeds clears it')
  assert.deepEqual(boardLoadStateAfter(null, { type: 'fail', invalidId: true }), { status: null, invalidId: true, message: 'This is not a valid board link.' })
})

test('the page shows the failure sentence in place of the board, so the spinner is never shown after a failure', () => {
  const page = readFileSync(new URL('../app/pages/projects/[id].vue', import.meta.url), 'utf8')
  const failure = page.indexOf('v-if="loadFailed"')
  const board = page.search(/<KanbanBoard\s/)
  assert.ok(failure > 0 && board > 0, 'the failure block and the board are both in the page')
  assert.ok(failure < board, 'the failure block comes before the board, so a failed load never mounts the board spinner')
  assert.match(page, /boardLoadMessage\(\{ invalidId: loadInvalidId, status: loadFailStatus \}\)/)
})

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

test('the store holds the load error: a failed load sets it, a retry clears it, a load clears it', () => {
  const store = readFileSync(new URL('../app/composables/useProjects.ts', import.meta.url), 'utf8')
  assert.match(store, /boardLoadStateAfter\(_boardLoadError\.value, \{ type: 'fail', status:/)
  assert.match(store, /boardLoadStateAfter\(_boardLoadError\.value, \{ type: 'retry' \}\)/)
  assert.match(store, /boardLoadStateAfter\(_boardLoadError\.value, \{ type: 'loaded' \}\)/)
  assert.match(store, /boardLoadError: _boardLoadError,/)
})

test('the page shows the sentence with Try again and Back to boards, never the spinner, after a failure', () => {
  const page = readFileSync(new URL('../app/pages/projects/[id].vue', import.meta.url), 'utf8')
  assert.match(page, /boardLoadMessage\(/)
  assert.match(page, /label="Try again"/)
  assert.match(page, /label="Back to boards"/)
  assert.match(page, /isBoardId\(id\)/)
})
