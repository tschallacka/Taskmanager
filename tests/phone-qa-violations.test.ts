// Quincy's two QA violations on Redesign 9/9 (card mwc4jp06c11oh0yz2hb, head 53fe3ed), checked on the sources:
//   1. the help page describes the phone column picker and the swipe between columns;
//   2. a long-press on a card at phone width opens the same bottom sheet as the three-dot menu, not the desktop popover.
// Run:
//   node --import tsx --test tests/phone-qa-violations.test.ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8')
const help = read('docs/basics/boards-and-columns.md')
const card = read('app/components/kanban/KanbanCard.vue')

test('1: the help page describes the phone column picker and the swipe between columns', () => {
  assert.match(help, /column picker/i, 'the help page names the column picker')
  assert.match(help, /swipe/i, 'the help page says a swipe moves between columns')
  assert.match(help, /swipe for other columns|between columns/i, 'the help page says what the swipe does')
})

test('2: the desktop context menu is off on a phone, so a long-press cannot open it', () => {
  assert.match(card, /<UContextMenu\s+:items="menuItems"\s+:disabled="trashed \|\| phoneWidth"/, 'the context menu is disabled at phone width')
})

test('2: a long-press (the contextmenu event) on a phone opens the card\'s bottom sheet through the menu event', () => {
  assert.match(card, /@contextmenu="onPhoneLongPress"/, 'the card listens for the long-press event')
  const fn = card.match(/function onPhoneLongPress\(event: Event\) \{([\s\S]*?)\n\}/)
  assert.ok(fn, 'onPhoneLongPress exists')
  assert.match(fn[1]!, /phoneWidth\.value/, 'it acts only at phone width')
  assert.match(fn[1]!, /event\.preventDefault\(\)/, 'it stops the native menu')
  assert.match(fn[1]!, /emit\('menu', props\.task\.id\)/, 'it opens the same sheet as the three-dot: the menu event')
})
