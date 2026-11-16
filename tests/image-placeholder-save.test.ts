// The description's saved HTML (logic): an unfinished image placeholder is never saved as content. A pending placeholder is taken out
// of the saved HTML; a failed one stays as its visible line; everything else is left as it is.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripPendingPlaceholders } from '../app/utils/editor/imagePlaceholders'

test('a pending placeholder is removed from the saved HTML', () => {
  const html = '<p>before <span class="image-placeholder" data-image-placeholder="a" data-state="pending">Uploading image…</span> after</p>'
  assert.equal(stripPendingPlaceholders(html), '<p>before  after</p>')
})

test('a failed placeholder stays as its visible line', () => {
  const html = '<p><span class="image-placeholder" data-image-placeholder="b" data-state="failed">Image failed to upload: too large</span></p>'
  assert.equal(stripPendingPlaceholders(html), html)
})

test('several pending placeholders are all removed, and nothing else changes', () => {
  const html = '<p>x <span data-image-placeholder="a" data-state="pending">Uploading image…</span>'
    + '<span data-image-placeholder="b" data-state="pending">Uploading image…</span> y</p><img src="/a.png">'
  assert.equal(stripPendingPlaceholders(html), '<p>x  y</p><img src="/a.png">')
})

test('HTML with no placeholder is returned unchanged', () => {
  const html = '<p>hello <strong>world</strong></p>'
  assert.equal(stripPendingPlaceholders(html), html)
})
