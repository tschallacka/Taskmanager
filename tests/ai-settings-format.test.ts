// The AI settings formatters (redesign 8/9, step A of the page split): context length, price per million tokens and
// money. They are pure, so they live in their own file and the settings page imports them. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json node --import tsx --test tests/ai-settings-format.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatContextLength, formatMoney, formatPricePerMillion } from '../app/utils/aiSettingsFormat'

test('a context length reads in thousands or millions, and nothing when unknown', () => {
  assert.equal(formatContextLength(null), null)
  assert.equal(formatContextLength(0), null)
  assert.equal(formatContextLength(128000), '128k context')
  assert.equal(formatContextLength(1000000), '1M context')
  assert.equal(formatContextLength(1500000), '1.5M context')
})

test('a price per token shows per million tokens, and nothing when it is not a number', () => {
  assert.equal(formatPricePerMillion(null), null)
  assert.equal(formatPricePerMillion(Number.NaN), null)
  assert.match(formatPricePerMillion(0.000001) ?? '', /^\$1\/M$/)
  assert.match(formatPricePerMillion(0.0000025) ?? '', /^\$2[.,]5\/M$/)
})

test('money is in dollars with two to four decimals', () => {
  assert.match(formatMoney(1.5), /^\$1[.,]50$/)
  assert.match(formatMoney(0.0123), /^\$0[.,]0123$/)
})
