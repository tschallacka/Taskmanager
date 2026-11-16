// The image placeholders in a task description (logic): an image pasted into the text shows a placeholder at once, moves through
// pending, done or failed, and an unfinished placeholder is never saved as content. Several at once each keep their own state.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPlaceholders, saveText } from '../app/utils/editor/imagePlaceholders'

test('a placeholder starts pending with no progress, and shows the uploading line', () => {
  const p = createPlaceholders()
  p.start('a')
  assert.deepEqual(p.get('a'), { id: 'a', state: 'pending', progress: null })
})

test('progress fills a pending placeholder; a value outside 0 to 1 is clamped', () => {
  const p = createPlaceholders()
  p.start('a')
  p.progress('a', 0.4)
  assert.equal(p.get('a')?.progress, 0.4)
  p.progress('a', 2)
  assert.equal(p.get('a')?.progress, 1)
  p.progress('a', -1)
  assert.equal(p.get('a')?.progress, 0)
})

test('done keeps the URL and stops progress', () => {
  const p = createPlaceholders()
  p.start('a')
  p.progress('a', 0.5)
  p.done('a', '/api/attachments/tasks/t1/a.png')
  assert.deepEqual(p.get('a'), { id: 'a', state: 'done', progress: 1, url: '/api/attachments/tasks/t1/a.png' })
  p.progress('a', 0.2)
  assert.equal(p.get('a')?.state, 'done', 'a finished placeholder does not go back')
})

test('failed keeps the reason and is never removed silently', () => {
  const p = createPlaceholders()
  p.start('a')
  p.fail('a', 'The file is too large')
  assert.deepEqual(p.get('a'), { id: 'a', state: 'failed', progress: null, error: 'The file is too large' })
  p.fail('a', 'again')
  assert.equal(p.get('a')?.error, 'The file is too large', 'the first reason stays')
})

test('several at once each keep their own state', () => {
  const p = createPlaceholders()
  p.start('a')
  p.start('b')
  p.start('c')
  p.done('a', '/a.png')
  p.fail('b', 'no')
  p.progress('c', 0.3)
  assert.deepEqual(p.all().map(x => [x.id, x.state]), [['a', 'done'], ['b', 'failed'], ['c', 'pending']])
})

test('an unknown id is ignored by every call', () => {
  const p = createPlaceholders()
  p.progress('zz', 0.5)
  p.done('zz', '/x.png')
  p.fail('zz', 'no')
  assert.equal(p.get('zz'), undefined)
  assert.deepEqual(p.all(), [])
})

test('saved text drops a pending placeholder, so an unfinished image is never saved as content', () => {
  const text = 'before [img:a] after'
  const p = createPlaceholders()
  p.start('a')
  assert.equal(saveText(text, p.all()), 'before  after')
})

test('saved text keeps a done image and keeps a failed line until someone removes it', () => {
  const p = createPlaceholders()
  p.start('a')
  p.done('a', '/a.png')
  p.start('b')
  p.fail('b', 'too large')
  const text = '[img:a] x [img:b]'
  assert.equal(saveText(text, p.all()), '![image](/a.png) x [Image failed to upload: too large]')
})
