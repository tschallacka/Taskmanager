// The board page's pieces from redesign 3/9: the Done drop slot, the filter chips in the Filter
// button, and the "+N" count. The UI is a Vue component, so these tests read the source the way
// tests/design-tokens.test.ts does. They check that the one Done rule lives in tagColors.ts, that
// the board uses it, that the drop slot is gated on an empty Done column with no filter on, and
// that the filter chips take the label's own colour through tagChipAttrs. Run:
//   node --import tsx --test tests/board-page-chips.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8')
const tagColors = read('app', 'utils', 'tagColors.ts')
const board = read('app', 'components', 'kanban', 'KanbanBoard.vue')
const page = read('app', 'pages', 'projects', '[id].vue')

test('the Done name rule is written once, in tagColors.ts', () => {
  const rule = /\/\^done\$\/i/g
  assert.equal((tagColors.match(rule) ?? []).length, 1, 'one exact Done rule in tagColors.ts')
  assert.match(tagColors, /export function isDoneColumnName\(name: string\): boolean \{\s*return \/\^done\$\/i\.test\(name\.trim\(\)\)/)
  assert.equal((board.match(rule) ?? []).length, 0, 'KanbanBoard.vue has no copy of the rule')
  assert.equal((page.match(rule) ?? []).length, 0, 'the board page has no copy of the rule')
})

test('KanbanBoard uses the shared Done rule for the drop slot', () => {
  assert.match(board, /import \{[^}]*isDoneColumnName[^}]*\} from '~\/utils\/tagColors'/)
  assert.match(board, /const isDoneColumn = \(column: \{ name: string \}\) => isDoneColumnName\(column\.name\)/)
})

test('the drop slot shows only in an empty Done column with no filter on, and says what to do', () => {
  assert.match(board, /v-else-if="!isFiltering && isDoneColumn\(column\) && tasksOf\(column\.id\)\.length === 0"/)
  assert.match(board, /data-done-drop-slot/)
  assert.match(board, /Drag a finished task here, or tick its circle\./)
})

test('the filter chips take the label colour through tagChipAttrs, as LabelChip does', () => {
  assert.match(page, /import \{ tagChipAttrs \} from '~\/utils\/tagColors'/)
  assert.match(page, /import \{ boardLabelColor \} from '~\/composables\/useProjects'/)
  assert.match(page, /v-for="tag in activeTags\.slice\(0, 2\)"/)
  assert.match(page, /:class="tagChipAttrs\(tag, boardLabelColor\(tag\)\)\.class"/)
  assert.match(page, /:style="tagChipAttrs\(tag, boardLabelColor\(tag\)\)\.style"/)
  // The whole opening tag of the chip: its class list must carry the ring and no fixed tone.
  const opening = page.match(/<span\s[^>]*data-filter-chip[^>]*>/)
  assert.ok(opening, 'the filter chip has an opening tag')
  assert.match(opening[0], /ring-1 ring-inset/, 'the chip has the ring, as LabelChip does')
  assert.doesNotMatch(opening[0], /tm-tone-/, 'no fixed tone class on a filter chip')
  assert.doesNotMatch(opening[0], /text-(warning|error|success|primary|info)/, 'no fixed semantic colour on a filter chip')
})

test('the +N count shows past two labels and is a neutral chip', () => {
  assert.match(page, /v-if="activeTags\.length > 2"/)
  assert.match(page, /data-filter-more/)
  assert.match(page, />\+\{\{ activeTags\.length - 2 \}\}</)
})
