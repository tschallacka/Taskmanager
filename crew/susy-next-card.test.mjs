// Susy daemon, phase 3 (card mwf201blsqvx3jczev): an idle worker is offered the next card of the queue, by mail, once.
// Fake boards only: no network, no mail, no board writes. Run: node --test crew/susy-next-card.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextCardOffers, offerMarkerOf, offerText, offerRound } from './susy-next-card.mjs'

const KEYS = { 'Wade Worker': 'wade', 'Wick Worker': 'wick', 'Wren Worker': 'wren', 'Wynn Worker': 'wynn' }
const keyOf = name => KEYS[name] ?? null
const card = (id, column, extra = {}) => ({
  id,
  title: `card ${id}`,
  column,
  assignee: null,
  tags: [],
  completed: false,
  blocked: false,
  description: `Context for ${id}.`,
  updates: [],
  ...extra
})
const busy = (id, name) => card(id, 'In progress', { assignee: name })

test('an idle worker is offered the first card of the queue', () => {
  const out = nextCardOffers({ cards: [busy('x', 'Wick Worker'), card('a', 'To do'), card('b', 'To do')], keyOf })
  // Wick is busy. The idle workers in WORKERS order are wren, wynn, wade: the first queue card goes to wren, the second to wynn.
  assert.deepEqual(out.offers.map(o => [o.to, o.cardId]), [['wren', 'a'], ['wynn', 'b']])
})

test('a worker with a card in progress is not offered one', () => {
  const out = nextCardOffers({ cards: [busy('x', 'Wade Worker'), card('a', 'To do')], keyOf })
  assert.equal(out.offers.some(o => o.to === 'wade'), false)
})

test('a card already offered is not offered again', () => {
  const offered = card('a', 'To do', { updates: [{ author: 'crew susy (agent)', body: 'Susy: offered to wade | at 2026-11-16T10:00:00.000Z', at: '2026-11-16T10:00:00.000Z' }] })
  const out = nextCardOffers({ cards: [offered, card('b', 'To do')], keyOf })
  assert.equal(out.offers.some(o => o.cardId === 'a'), false)
  assert.ok(out.offers.some(o => o.cardId === 'b'))
})

test('two idle workers get two different cards in one round', () => {
  const out = nextCardOffers({ cards: [card('a', 'To do'), card('b', 'To do')], keyOf })
  const ids = out.offers.map(o => o.cardId)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(out.offers.length >= 2)
})

test('an assigned card is not in the queue', () => {
  const out = nextCardOffers({ cards: [card('a', 'To do', { assignee: 'Wren Worker' })], keyOf })
  assert.deepEqual(out.offers, [])
})

test('a Done card is not offered', () => {
  const out = nextCardOffers({ cards: [card('a', 'Done')], keyOf })
  assert.deepEqual(out.offers, [])
})

test('a shipped or blocked card is not offered', () => {
  const out = nextCardOffers({ cards: [card('a', 'To do', { tags: ['shipped'] }), card('b', 'To do', { blocked: true })], keyOf })
  assert.deepEqual(out.offers, [])
})

test('an empty queue says nothing', () => {
  assert.deepEqual(nextCardOffers({ cards: [busy('x', 'Wade Worker')], keyOf }).offers, [])
})

test('the marker and the mail carry the card and the one thing to do', () => {
  const out = nextCardOffers({ cards: [card('a', 'To do', { title: 'Popup fix' })], keyOf })
  const offer = out.offers[0]
  assert.equal(offer.marker, `Susy: offered to ${offer.to} | at ${offer.at}`)
  assert.match(offer.text, /Popup fix/)
  assert.match(offer.text, /first claim wins/)
  assert.equal(offerMarkerOf({ author: 'crew susy (agent)', body: offer.marker }), offer.to)
  assert.equal(offerMarkerOf({ author: 'crew wade (agent)', body: 'offered to wade' }), null)
  assert.match(offerText(card('c', 'To do', { title: 'T', description: 'First sentence. Second.' }), 'wade'), /First sentence\./)
})

// ---- the round: dry-run logs, live offers (the marker is written first by the daemon), kill switch ----

test('dry-run logs each offer and offers nothing live', () => {
  const out = offerRound({ cards: [card('a', 'To do')], keyOf, live: false, enabled: true })
  assert.deepEqual(out.offers, [])
  assert.match(out.lines[0], /^would offer wren: card a/)
})

test('live with the switch on: the offers are returned for the daemon to write and mail', () => {
  const out = offerRound({ cards: [card('a', 'To do')], keyOf, live: true, enabled: true })
  assert.equal(out.offers.length, 1)
  assert.equal(out.offers[0].to, 'wren')
  assert.match(out.offers[0].marker, /^Susy: offered to wren \| at /)
})

test('live with the switch off: nothing is offered, and a line says the switch is off', () => {
  const out = offerRound({ cards: [card('a', 'To do')], keyOf, live: true, enabled: false })
  assert.deepEqual(out.offers, [])
  assert.match(out.lines[0], /next card off \(susy\.dispatch\.nextCard is not true\)/)
})

test('no board read (no cards): nothing happens', () => {
  assert.deepEqual(offerRound({ cards: undefined, keyOf, live: true, enabled: true }), { offers: [], lines: [] })
})
