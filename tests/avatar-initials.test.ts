// The initials and colour of an avatar without a picture (app/utils/avatarInitials.ts): the same id gives the same colour,
// the initials follow the name rules, and every palette colour has readable text (4.5:1 or better).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AVATAR_PALETTE, colourFor, contrast, initialsOf, textOn } from '../app/utils/avatarInitials'

test('the colour for a user id is the same every time, and always from the palette', () => {
  const first = colourFor('user_abc123')
  for (let i = 0; i < 5; i++) assert.equal(colourFor('user_abc123'), first)
  assert.ok((AVATAR_PALETTE as readonly string[]).includes(first))
  const spread = new Set(['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10', 'u11', 'u12', 'u13', 'u14', 'u15', 'u16'].map(colourFor))
  assert.ok(spread.size >= 4, 'different ids land on different colours')
})

test('initials: first and last word of the name; one word gives one letter; no name falls back to the email', () => {
  assert.equal(initialsOf('Maria Pia Planner', 'pia@example.com'), 'MP')
  assert.equal(initialsOf('wren', 'wren@example.com'), 'W')
  assert.equal(initialsOf('  Ada   Lovelace ', null), 'AL')
  assert.equal(initialsOf(null, 'jan.de.vries@example.com'), 'J')
  assert.equal(initialsOf('', '  '), '?')
  assert.equal(initialsOf('ÉlodieÂ Ångström', null), 'ÉÅ', 'letters outside ASCII count as letters')
})

test('every palette colour has readable text in both directions: 4.5:1 or better', () => {
  for (const background of AVATAR_PALETTE) {
    const text = textOn(background)
    assert.ok(contrast(background, text) >= 4.5, `${background} with ${text} is ${contrast(background, text).toFixed(2)}:1`)
  }
})
