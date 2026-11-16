// Nina's CQ findings on Redesign 9/9 (card mwc4jp06c11oh0yz2hb, head b8aa738). The phone board and sheet are checked on
// their sources, since a browser is not needed for these rules. Run:
//   node --import tsx --test tests/phone-board-cq.test.ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8')
const board = read('app/components/kanban/KanbanBoard.vue')
const picker = read('app/components/PhoneColumnPicker.vue')
const sheet = read('app/components/PhoneCardSheet.vue')

test('1: the phone sheet moves a card through the board\'s own move, with its error toast', () => {
  const fn = board.match(/function onPhoneMove\(columnId: string\) \{([\s\S]*?)\n\}/)
  assert.ok(fn, 'onPhoneMove exists')
  assert.match(fn[1]!, /onMoveTask\(phoneSheetTaskId\.value, columnId\)/, 'onPhoneMove calls onMoveTask')
  assert.doesNotMatch(fn[1]!, /\bmoveTask\(/, 'onPhoneMove does not call moveTask directly')
})

test('2: the active phone column is a live column, so a trashed one is never shown', () => {
  assert.match(
    board,
    /const phoneActiveId = computed\(\(\) => \(liveColumns\.value\.some\(c => c\.id === phoneColumnId\.value\) \? phoneColumnId\.value : liveColumns\.value\[0\]\?\.id\) \?\? ''\)/,
    'phoneActiveId falls back to the first live column when the chosen one is trashed'
  )
})

test('4: the phone delete keeps the board\'s error text for a failed trash', () => {
  const fn = board.match(/async function confirmPhoneDelete\(\) \{([\s\S]*?)\n\}/)
  assert.ok(fn, 'confirmPhoneDelete exists')
  assert.match(fn[1]!, /'Could not move the task to the trash'/, 'the same message as onDeleteTask')
  assert.doesNotMatch(fn[1]!, /'Could not delete the task'/, 'the old message is gone')
})

test('5: the column picker is not a tab list: no tablist or tab roles, the chips say which is pressed', () => {
  assert.doesNotMatch(picker, /role="tablist"/, 'no tablist role')
  assert.doesNotMatch(picker, /role="tab"/, 'no tab role')
  assert.match(picker, /:aria-pressed="column\.id === props\.activeId"/, 'the active chip is aria-pressed')
})

test('6: each sheet action closes the sheet in its own case, not by falling through', () => {
  const fn = sheet.match(/function run\(key[\s\S]*?\n\}/)
  assert.ok(fn, 'run exists')
  assert.match(fn[0], /switch \(key\)/, 'run is a switch')
  for (const key of ['done', 'delete']) {
    const block = fn[0].match(new RegExp(`case '${key}':([\\s\\S]*?)(case '|\\n  \\}\\n\\})`))
    assert.ok(block, `case ${key} exists`)
    assert.match(block[1]!, /emit\('update:open', false\)/, `case ${key} closes the sheet itself`)
  }
})
