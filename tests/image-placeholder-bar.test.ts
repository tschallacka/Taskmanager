// The placeholder's progress bar (logic): a pending placeholder shows its progress as a filled part of its background; an unknown
// length shows a fixed partial bar (indeterminate). Other states have no bar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placeholderBarStyle } from '../app/utils/editor/imagePlaceholders'

test('a known progress fills that share of the placeholder', () => {
  const style = placeholderBarStyle('pending', 0.4)
  assert.match(style, /--progress: 0\.4/)
  assert.match(style, /calc\(var\(--progress\) \* 100%\)/)
})

test('an unknown progress shows an indeterminate partial bar', () => {
  const style = placeholderBarStyle('pending', null)
  assert.match(style, /--progress: 0\.3/)
})

test('a finished or failed placeholder has no bar', () => {
  assert.equal(placeholderBarStyle('done', 1), '')
  assert.equal(placeholderBarStyle('failed', null), '')
})
