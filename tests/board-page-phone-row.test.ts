// The board's view row at phone width (QA, Redesign 3/9): the view switcher must keep room to pick a view with a filter on,
// and New task must stay on screen. The row wraps on a phone: the switcher takes a line of its own, and the tools
// (Filter, search, New task) wrap inside their own box. On a desktop (lg and up) the switcher shares the row, as before.
// The page is a Vue component, so the rule is read from its source, as the other board tests do. Run:
//   node --import tsx --test tests/board-page-phone-row.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const page = readFileSync(join(process.cwd(), 'app', 'pages', 'projects', '[id].vue'), 'utf8')

test('the view row wraps, so the switcher is never squeezed to nothing by the tools', () => {
  assert.match(page, /<div class="flex flex-wrap items-center gap-2 border-b border-default px-4 lg:px-6">/)
})

test('the view switcher takes its own line on a phone and shares the row from lg up', () => {
  assert.match(page, /class="flex min-w-0 flex-1 basis-full items-center gap-1 overflow-x-auto py-1 lg:basis-0"/)
})

test('the tools box wraps inside itself, and New task keeps its size', () => {
  assert.match(page, /class="flex min-w-0 flex-wrap items-center justify-end gap-2 py-1\.5"/)
  assert.doesNotMatch(page, /class="flex shrink-0 items-center gap-2 py-1\.5"/)
  assert.match(page, /label="New task"[\s\S]{0,200}class="shrink-0"/)
})
