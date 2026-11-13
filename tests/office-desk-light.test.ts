// The office's desk light: what each status shows (shared/office/model.ts deskLightOf) and where the server gets the
// status for each cast member (server/utils/deskStatus.ts). Pure, no database. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json node --import tsx --test tests/office-desk-light.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { deskLightOf } from '../shared/office/model'

test('the floating dot, ring and dashed light are gone from the actor; the desk lamp carries the status', () => {
  const actor = readFileSync(new URL('../app/office/actor.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(actor, /buildDeskLight|this\.light\b|LIGHT_RADIUS/, 'no floating light is built or drawn')
  assert.match(actor, /statusText = deskLightOf\(status\)\.text|deskLightOf\(status\)\.text/, 'the actor keeps the status text')
  const office = readFileSync(new URL('../app/office/office.ts', import.meta.url), 'utf8')
  assert.match(office, /lamp\.glow\.visible = deskLightOf\(person\.status\)\.shape === 'lit'/, 'the lamp glow follows the status')
})
import type { OfficePerson, PersonStatus } from '../shared/office/model'
import { deskStatusSource, withDeskStatus } from '../server/utils/deskStatus'

const wren: OfficePerson = { userId: 'u1', key: 'wren', name: 'Wren Worker', role: 'worker' }
const pia: OfficePerson = { userId: 'u2', key: 'pia', name: 'Pia Planner', role: 'pm' }

test('busy (a card in progress) is green and lit, and says what the monitor gives', () => {
  const light = deskLightOf({ state: 'busy', note: 'Busy: ir9yf review' })
  assert.deepEqual(light, { state: 'busy', color: '#2a9d43', shape: 'lit', text: 'Busy: ir9yf review' })
})

test('idle (nothing in progress) is red and dim; with no note it still says idle', () => {
  assert.deepEqual(deskLightOf({ state: 'idle', note: 'Idle since 21:40' }), { state: 'idle', color: '#d62828', shape: 'dim', text: 'Idle since 21:40' })
  assert.equal(deskLightOf({ state: 'idle', note: '' }).text, 'Idle')
})

test('no status known is grey and dashed, and never a guess', () => {
  assert.deepEqual(deskLightOf(undefined), { state: 'unknown', color: '#8e8e93', shape: 'dashed', text: 'No status yet' })
  assert.deepEqual(deskLightOf({ state: 'unknown', note: '' }), { state: 'unknown', color: '#8e8e93', shape: 'dashed', text: 'No status yet' })
})

test('the light follows the status field: each change shows in the light', () => {
  const sequence: PersonStatus[] = [
    { state: 'unknown', note: '' },
    { state: 'busy', note: 'Busy' },
    { state: 'idle', note: 'Idle since 21:40' },
    { state: 'busy', note: 'Busy' }
  ]
  const shapes = sequence.map(s => deskLightOf(s).shape)
  assert.deepEqual(shapes, ['dashed', 'lit', 'dim', 'lit'])
  const colors = sequence.map(s => deskLightOf(s).color)
  assert.deepEqual(colors, ['#8e8e93', '#2a9d43', '#d62828', '#2a9d43'])
})

test('the server gives every cast member the unknown light until the monitor reports', async () => {
  const cast = await withDeskStatus([wren, pia])
  assert.deepEqual(cast.map(p => p.status), [{ state: 'unknown', note: '' }, { state: 'unknown', note: '' }])
  assert.equal(await deskStatusSource.statusOf(wren), null)
})

test('a status source fills the light for the people it knows, and the rest stay unknown', async () => {
  const source = {
    async statusOf(person: OfficePerson): Promise<PersonStatus | null> {
      return person.key === 'wren' ? { state: 'busy', note: 'Busy' } : null
    }
  }
  const cast = await withDeskStatus([wren, pia], source)
  assert.deepEqual(cast[0]?.status, { state: 'busy', note: 'Busy' })
  assert.deepEqual(cast[1]?.status, { state: 'unknown', note: '' })
  // The people themselves are unchanged apart from the status.
  assert.equal(cast[0]?.name, 'Wren Worker')
})
