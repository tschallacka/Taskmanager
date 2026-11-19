// The text a placeholder shows in the editor (logic): "Uploading image…" while pending, and the visible failure line with its reason.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placeholderLabel } from '../app/utils/editor/imagePlaceholders'

test('a pending placeholder reads "Uploading image…"', () => {
  assert.equal(placeholderLabel({ id: 'a', state: 'pending', progress: 0.3 }), 'Uploading image…')
})

test('a failed placeholder reads the failure with its reason', () => {
  assert.equal(placeholderLabel({ id: 'a', state: 'failed', progress: null, error: 'The file is too large' }), 'Image failed to upload: The file is too large')
})

test('a failed placeholder with no reason says so', () => {
  assert.equal(placeholderLabel({ id: 'a', state: 'failed', progress: null }), 'Image failed to upload: unknown error')
})
