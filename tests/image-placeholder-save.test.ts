// The description's saved HTML (logic): an unfinished image placeholder is never saved as content. A pending placeholder is taken out
// of the saved HTML; a failed one stays as its visible line; everything else is left as it is.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldAdoptServerDescription, stripPendingPlaceholders } from '../app/utils/editor/imagePlaceholders'

const pendingHtml = '<p>XYZ <span class="image-placeholder" data-image-placeholder="a" data-state="pending">Uploading image…</span></p>'

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

// The drawer adopts the server's copy of the description only when it is a change from elsewhere. An answer to one of our own
// saves must not replace the editor: a late answer to an earlier save put back the text from before the typing and took the
// pending placeholders out, so both uploads landed nowhere (the browser repro on the image paste card).
test('a late answer to our own earlier save does not replace what the person has typed since', () => {
  const ownSaves = ['<p></p>', '<p>XYZ </p>']
  assert.equal(shouldAdoptServerDescription('<p></p>', pendingHtml, ownSaves), false)
  assert.equal(shouldAdoptServerDescription('<p>XYZ </p>', pendingHtml, ownSaves), false)
})

test('the server copy does not replace the editor while an upload is pending', () => {
  assert.equal(shouldAdoptServerDescription('<p>from a teammate</p>', pendingHtml, []), false)
})

test('a change from elsewhere is adopted when nothing is pending and it is not one of our saves', () => {
  assert.equal(shouldAdoptServerDescription('<p>from a teammate</p>', '<p>mine</p>', ['<p>mine</p>']), true)
})

test('a server copy equal to what the editor shows is not adopted again', () => {
  assert.equal(shouldAdoptServerDescription('<p>same</p>', '<p>same</p>', []), false)
})
