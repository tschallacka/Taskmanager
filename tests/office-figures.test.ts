// The office's figures: every crew key gets a look, and a figure in the registry wins over the placeholder.
// Needs no database. Needs the three.js package from the repository's node_modules; without it the tests skip and say why.
// Run: node --import tsx --test tests/office-figures.test.ts
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const SKIP = existsSync(join(import.meta.dirname, '..', 'node_modules', 'three')) ? false : 'three is not installed in node_modules (npm install)'
const NEW_KEYS = ['susy', 'janet', 'pat', 'tess', 'rita']
const HEADWEAR = ['none', 'ponytail', 'spiky', 'hardhat', 'beanie', 'headphones', 'bun', 'cap', 'bald', 'curly']

// Loaded late, so a checkout without three skips instead of failing to import.
const load = async () => ({ ...(await import('../app/office/meshes')), ...(await import('../app/office/figures')) })

test('each new role gets a placeholder look that renders: a colour for the shirt and a known headwear', { skip: SKIP }, async () => {
  const { lookOf } = await load()
  for (const key of NEW_KEYS) {
    const look = lookOf(key)
    assert.match(look.shirt, /^#[0-9a-f]{6}$/i, `${key} has a shirt colour`)
    assert.match(look.skin, /^#[0-9a-f]{6}$/i, `${key} has a skin colour`)
    assert.ok(HEADWEAR.includes(look.headwear), `${key} has known headwear`)
  }
})

test('the placeholder is the same every time for one key, and differs between keys', { skip: SKIP }, async () => {
  const { lookOf } = await load()
  assert.deepEqual(lookOf('susy'), lookOf('susy'))
  assert.notEqual(lookOf('susy').shirt, lookOf('janet').shirt)
})

test('Pat has her own figure in the registry: a cap and round glasses, not the placeholder', { skip: SKIP }, async () => {
  const { lookOf, FIGURES } = await load()
  assert.equal(FIGURES.pat, lookOf('pat'))
  assert.equal(lookOf('pat').headwear, 'cap')
  assert.equal(lookOf('pat').glasses, 'round')
})

test('a figure in the registry is used instead of the placeholder', { skip: SKIP }, async () => {
  const { lookOf, FIGURES } = await load()
  const own = FIGURES.pat
  const before = lookOf('pat').shirt
  FIGURES.pat = { ...lookOf('pat'), shirt: '#123456' }
  try {
    assert.equal(lookOf('pat').shirt, '#123456')
  } finally {
    FIGURES.pat = own!
  }
  assert.equal(lookOf('pat').shirt, before)
})
