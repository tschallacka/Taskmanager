// The shared select's keyboard use (source level): AppSelect is a Nuxt UI select, which handles the arrows, Enter, Escape and typing to jump;
// AppSelect must not take those keys over, and its options and value come from the props.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('AppSelect is a Nuxt UI select, so the arrows, Enter, Escape and type-to-jump come with it', () => {
  const select = read('app/components/AppSelect.vue')
  assert.match(select, /<USelect/)
  assert.doesNotMatch(select, /@keydown/, 'AppSelect does not take the keys over')
  assert.doesNotMatch(select, /onKeydown|keydown\./, 'no keyboard handler of its own')
})

test('AppSelect shows the options and the selected value it is given', () => {
  const select = read('app/components/AppSelect.vue')
  assert.match(select, /:model-value="model \?\? undefined"/, 'the selected value comes from the model')
  assert.match(select, /value-key="value"/, 'each option is matched by its value')
})
