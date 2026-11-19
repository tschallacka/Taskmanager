// The accent choice shows the primary button as a live preview (redesign 8/9, the Appearance item of the Do list). The
// preview is a primary button in the Appearance section, so it takes the accent the moment a swatch is picked. Source
// level. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json node --import tsx --test tests/settings-appearance-preview.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/components/settings/Appearance.vue', import.meta.url), 'utf8')

test('the Appearance section shows a primary button as the live preview of the accent', () => {
  assert.match(source, /data-appearance-preview/)
  assert.match(source, /<UButton[\s\S]*?color="primary"[\s\S]*?data-appearance-preview/)
})

test('the preview is labelled, so a reader knows what it shows', () => {
  assert.match(source, /Preview/)
})

test('the preview sits with the accent swatches, not in another section', () => {
  const preview = source.indexOf('data-appearance-preview')
  const accent = source.indexOf('Accent color')
  const neutral = source.indexOf('Neutral color')
  assert.ok(preview > accent && preview < neutral + 1000)
})
