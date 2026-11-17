// The kit carries the Boss round and the Susy watch on Pia (card mwc5y4ccau9en3m3m7b), read as text like the other template
// tests. Susy has no CronCreate (a subagent has none), so her own timer is her Monitor; Pia's cron revives Susy; Boss's round
// revives Pia and the watches. Run from the kit folder: node --test boss-round.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const KIT = dirname(fileURLToPath(import.meta.url))
const read = file => readFileSync(join(KIT, file), 'utf8')

test('Susy watches Pia: unresponsive or not setting people to work goes as @cato, without copying Pia', () => {
  const susy = read('SUSY.md.tmpl')
  assert.match(susy, /Pia watch/, 'the section is there')
  assert.match(susy, /silent or gone for 10 minutes, or without a listener of her own/, 'unresponsive: silent or gone 10+ min, or no listener')
  assert.match(susy, /idle worker, or a To do card with no assignee for 15 minutes after an @pia/, 'not setting people to work')
  assert.match(susy, /as `@cato`, and do not copy Pia/, 'the @cato goes on the card, without copying Pia')
  assert.match(susy, /Boss reads Susy's `@cato` directly for that reason, and is the stopgap/, 'Boss reads it directly; it is the stopgap')
})
