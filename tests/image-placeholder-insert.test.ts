// The paste path (source level): an image shows its placeholder at the cursor at once, the upload reports progress into it, and it is
// replaced by the image (done) or by a visible failure line (failed). The editor registers the placeholder mark.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('a placeholder is inserted at once, before the upload starts', () => {
  const clip = read('app/utils/editor/clipboard.ts')
  const insert = clip.slice(clip.indexOf('export async function insertImages'), clip.indexOf('export function imageFiles'))
  assert.match(insert, /insertPlaceholders\(/, 'the placeholders go in first')
  assert.ok(insert.indexOf('insertPlaceholders(') < insert.indexOf('upload('), 'before the upload')
})

test('progress reports into the placeholder, and a finished upload replaces it with the image', () => {
  const clip = read('app/utils/editor/clipboard.ts')
  assert.match(clip, /updatePlaceholder\(/, 'progress updates the placeholder')
  assert.match(clip, /settleWithImage\(/, 'done replaces it with the image')
  assert.match(clip, /settleWithError\(/, 'failed replaces it with a visible line')
})

test('the uploader reports progress and fails by rejecting, so the line can say why', () => {
  const clip = read('app/utils/editor/clipboard.ts')
  assert.match(clip, /export type ImageUploader = \(file: File, onProgress\?: \(progress: number \| null\) => void\) => Promise<string \| null>/)
})

test('the editor registers the placeholder mark', () => {
  const editor = read('app/components/RichEditor.vue')
  assert.match(editor, /ImagePlaceholderMark/)
  const mark = read('app/utils/editor/imagePlaceholderMark.ts')
  assert.match(mark, /name: 'imagePlaceholder'/)
  assert.match(mark, /data-image-placeholder/)
})
