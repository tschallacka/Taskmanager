// The default colour mode for a new visitor (no stored choice): follow the system setting, not a fixed dark theme.
// A choice someone already made is kept in their browser by the colour-mode plugin, so this default is only the
// starting point. The repository has no browser harness here, so the test reads the Nuxt config. Run:
//   node --import tsx --test tests/color-mode-default.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const config = readFileSync(join(import.meta.dirname, '..', 'nuxt.config.ts'), 'utf8')

test('a new visitor gets the system colour mode, not a fixed dark theme', () => {
  assert.match(config, /colorMode:\s*\{\s*preference:\s*'system'\s*\}/)
  assert.doesNotMatch(config, /colorMode:\s*\{\s*preference:\s*'dark'/)
})

test('the comment next to the default says that a stored choice is kept', () => {
  assert.match(config, /System is the default[^\n]*keeps that choice/i)
})
