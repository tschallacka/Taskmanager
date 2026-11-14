// The BLOCKED ON line (crew/blocked-on.mjs): the newest line names the key and the need, a line that is not the first line
// or has no key does not count, and a Blocked card without one is a finding; a card in another column is not.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blockedOnOf, blockedWithoutLine } from './blocked-on.mjs'

test('the newest BLOCKED ON line names the key and what is needed', () => {
  const updates = [
    { body: 'BLOCKED ON boss: push actor_id to arnotes_test_wynn' },
    { body: 'BLOCKED ON susy: an older line' }
  ]
  assert.deepEqual(blockedOnOf(updates), { key: 'boss', need: 'push actor_id to arnotes_test_wynn' })
})

test('a line that is not the first line of an update, or has no key, does not count', () => {
  assert.equal(blockedOnOf([{ body: 'Some text\nBLOCKED ON boss: decision X' }]), null)
  assert.equal(blockedOnOf([{ body: 'BLOCKED ON: no key' }]), null)
  assert.equal(blockedOnOf([]), null)
  assert.equal(blockedOnOf(undefined), null)
})

test('a Blocked card with no BLOCKED ON line is a finding; a card elsewhere, or with a line, is not', () => {
  const cards = [
    { id: 'c1', column: 'Blocked', updates: [{ body: 'waiting' }] },
    { id: 'c2', column: 'Blocked', updates: [{ body: 'BLOCKED ON boss: decision X' }] },
    { id: 'c3', column: 'To do', updates: [] }
  ]
  assert.deepEqual(blockedWithoutLine(cards), [{ id: 'c1', column: 'Blocked' }])
})

test('the rule is in the kit text: CREW.md names the line and the unblock, and the worker prompt says the same', async () => {
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const { dirname, join } = await import('node:path')
  const here = dirname(fileURLToPath(import.meta.url))
  const crew = readFileSync(join(here, 'CREW.md.tmpl'), 'utf8')
  const prompt = readFileSync(join(here, 'PROMPTS.md.tmpl'), 'utf8')
  assert.match(crew, /BLOCKED ON <key>: <what exactly is needed>/, 'CREW names the line')
  assert.match(crew, /When the need is met, the person who met it says so on the card in an update, and the worker moves the card back/, 'CREW item 4')
  assert.match(prompt, /BLOCKED ON <key>: <what exactly is needed>/, 'the worker prompt names the line')
  assert.match(prompt, /When the need is met, the person who met it says so on the card, and you move the card back/, 'the worker prompt item 4')
})
