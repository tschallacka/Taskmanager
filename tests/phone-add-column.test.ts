// On a phone the board shows one column, so the desktop Add column block must not peek in at the right edge (card
// mwc4jp06c11oh0yz2hb, subtask d). Its phone home is the last chip of the column picker, and the name field for the phone
// sits under the picker. The rule is checked on the component sources, since a browser is not needed for it. Run:
//   node --import tsx --test tests/phone-add-column.test.ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8')
const picker = read('app/components/PhoneColumnPicker.vue')
const board = read('app/components/kanban/KanbanBoard.vue')

test('the phone column picker has an Add column chip that emits add, shown only when it can add', () => {
  assert.match(picker, /data-testid="phone-add-column"/, 'the picker has the Add column chip')
  assert.match(picker, /v-if="props\.canAdd"/, 'the chip shows only when the board can add a column')
  assert.match(picker, /emit\('add'\)/, 'the chip emits add')
})

test('the desktop Add column block is hidden below the lg breakpoint', () => {
  const wrapper = board.match(/<div\s+v-if="!isCustomerView"\s+class="([^"]*kanban-add-column[^"]*)"/)
  assert.ok(wrapper, 'the desktop Add column wrapper is in the board')
  const classes = wrapper[1]!.split(/\s+/)
  assert.ok(classes.includes('hidden'), `the wrapper is hidden on a phone, has: ${wrapper[1]}`)
  assert.ok(classes.includes('lg:block'), `the wrapper shows from lg up, has: ${wrapper[1]}`)
})

test('the phone name field for a new column is shown below lg only, and the picker wires add to startAddColumn', () => {
  assert.match(board, /ref="phoneNewColumnEl"/, 'the phone name field is in the board')
  assert.match(board, /class="px-4 pb-2 lg:hidden"/, 'the phone name field shows below lg only')
  assert.match(board, /@add="startAddColumn"/, 'the picker chip opens the add-column flow')
})
