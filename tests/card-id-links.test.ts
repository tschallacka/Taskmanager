// The link rule for card ids in text (app/utils/cardIdLinks.ts): an id the reader may open becomes a link, an id the
// reader may not open stays plain text, and text around the ids is kept in order.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitCardIds } from '../app/utils/cardIdLinks'

const openable = new Set(['mwasus18611939jk1av', 'mwddksx8b69fx30jn18'])
const mayOpen = (id: string) => openable.has(id)

test('an id the reader may open becomes a link, and the text around it is kept in order', () => {
  const pieces = splitCardIds('See mwasus18611939jk1av for the reply.', mayOpen)
  assert.deepEqual(pieces, [
    { text: 'See ' },
    { id: 'mwasus18611939jk1av', openable: true },
    { text: ' for the reply.' }
  ])
})

test('an id the reader may not open stays plain text, so the link never shows a hidden card exists', () => {
  const pieces = splitCardIds('Hidden mwhidden0000000000000 and open mwddksx8b69fx30jn18.', mayOpen)
  assert.deepEqual(pieces, [
    { text: 'Hidden mwhidden0000000000000 and open ' },
    { id: 'mwddksx8b69fx30jn18', openable: true },
    { text: '.' }
  ])
})

test('ids at the start and the end, and two ids in a row, are both split out', () => {
  const pieces = splitCardIds('mwasus18611939jk1av mwddksx8b69fx30jn18', mayOpen)
  assert.deepEqual(pieces, [
    { id: 'mwasus18611939jk1av', openable: true },
    { text: ' ' },
    { id: 'mwddksx8b69fx30jn18', openable: true }
  ])
})

test('text with no card id, and an empty text, come back as they are', () => {
  assert.deepEqual(splitCardIds('no ids here', mayOpen), [{ text: 'no ids here' }])
  assert.deepEqual(splitCardIds('', mayOpen), [])
})

test('a word that only looks like an id (too short, or not starting with mw) is not split', () => {
  assert.deepEqual(splitCardIds('mw123 and xmwasus18611939jk1av', () => true), [{ text: 'mw123 and xmwasus18611939jk1av' }])
})
