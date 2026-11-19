// The Appearance swatches have a visible name and a keyboard focus ring (redesign 8/9). Read from the section's source
// (app/components/settings/Appearance.vue since step B), as the other settings tests do. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json node --import tsx --test tests/settings-swatches.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../app/components/settings/Appearance.vue', import.meta.url), 'utf8')

test('each accent and neutral swatch shows its name as visible text', () => {
  assert.match(page, /<span class="text-xs text-muted capitalize">\{\{ color \}\}<\/span>/)
  assert.equal((page.match(/capitalize">\{\{ color \}\}/g) ?? []).length, 2)
})

test('each swatch has a keyboard focus ring, and its focus outline is not removed without one', () => {
  assert.equal((page.match(/focus-visible:ring-2 focus-visible:ring-primary/g) ?? []).length, 2)
})

test('each swatch names its colour and its state for a screen reader', () => {
  assert.match(page, /:aria-label="`Accent \$\{color\}`"/)
  assert.match(page, /:aria-label="`Neutral \$\{color\}`"/)
  assert.equal((page.match(/:aria-pressed=/g) ?? []).length, 2)
})
