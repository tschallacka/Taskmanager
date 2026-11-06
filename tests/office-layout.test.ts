// The office floor plan: every person can walk from their seat to every spot a folder can lie, and
// nobody's desk lands on top of anyone else's. Pure; needs no database or renderer. Run:
//   node --import tsx --test tests/office-layout.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLayout } from '../app/office/layout'
import { DEMO_CAST } from '../shared/office/demo'
import { castWithStandIns } from '../shared/office/model'
import type { OfficePerson } from '../shared/office/model'

function placesFor(cast: OfficePerson[]): string[] {
  const fixed = ['tube', 'shredder', 'shelf:blocked', 'jar:bugs', 'dock:ready', 'archive:done']
  const personal = cast.flatMap((p) => {
    if (p.role === 'pm') return [`${p.key}:backlog`, `${p.key}:verify`]
    if (p.role === 'boss') return [`${p.key}:inbox`]
    if (p.role === 'worker') return [`${p.key}:todo`, `${p.key}:desk`]
    return [`${p.key}:review`]
  })
  return [...fixed, ...personal]
}

function assertWalkable(cast: OfficePerson[]) {
  const layout = buildLayout(cast)
  for (const person of cast) {
    const seat = layout.seatNode(person.key)
    assert.ok(layout.graph.nodes.has(seat), `${person.key} has no seat`)
    for (const place of placesFor(cast)) {
      const there = layout.approach(place, person.key)
      assert.ok(layout.graph.nodes.has(there), `${person.key} cannot stand anywhere for ${place}`)
      if (there === seat) continue
      assert.ok(layout.graph.path(seat, there).length > 0, `${person.key} cannot walk from the seat to ${place}`)
      assert.ok(layout.graph.path(there, seat).length > 0, `${person.key} cannot walk back from ${place}`)
    }
  }
  const seats = cast.map(p => layout.desks.get(p.key)!.seat)
  for (let i = 0; i < seats.length; i++) {
    for (let j = i + 1; j < seats.length; j++) {
      assert.ok(Math.hypot(seats[i]!.x - seats[j]!.x, seats[i]!.z - seats[j]!.z) > 2, `${cast[i]!.key} and ${cast[j]!.key} share a desk`)
    }
  }
}

test('the demo crew can reach every tray, desk and fixture', () => {
  assertWalkable(DEMO_CAST)
})

test('a board with only a guest worker still gets a walkable office with Pia and the Boss', () => {
  assertWalkable(castWithStandIns([{ userId: 'x', key: 'u-x', name: 'Guest', role: 'worker' }]))
})

test('extra workers overflow into the reviewers\' row and stay reachable', () => {
  const many: OfficePerson[] = [
    ...DEMO_CAST.filter(p => p.role !== 'worker'),
    ...Array.from({ length: 7 }, (_, i) => ({ userId: `w${i}`, key: `u-w${i}`, name: `Worker ${i}`, role: 'worker' as const }))
  ]
  assertWalkable(many)
})

test('the courier walks in from the street to the Boss, and the Boss can sign, deliver and make the rounds', () => {
  const cast = castWithStandIns(DEMO_CAST)
  const layout = buildLayout(cast)
  assert.ok(layout.graph.path('street', 'boss:visitor').length > 0, 'the courier cannot reach the Boss')
  assert.ok(layout.graph.path('boss:visitor', 'street').length > 0, 'the courier cannot leave')
  const seat = layout.seatNode(layout.boss)
  assert.ok(layout.graph.path(seat, 'boss:sign').length > 0, 'the Boss cannot reach the courier')
  for (const place of placesFor(cast)) {
    const there = layout.approach(place, layout.boss)
    if (there === 'boss:sign') continue
    assert.ok(layout.graph.path('boss:sign', there).length > 0, `the Boss cannot carry a new folder to ${place}`)
  }
  for (const person of cast) {
    if (person.key === layout.boss) continue
    const stop = person.key === layout.pia ? 'pia:right' : `tray:${person.key}`
    assert.ok(layout.graph.nodes.has(stop), `no spot to stand at ${person.key}'s desk`)
    assert.ok(layout.graph.path(seat, stop).length > 0, `the Boss cannot visit ${person.key}`)
  }
})

test('the folders of a place stack upwards instead of sinking into each other', () => {
  const layout = buildLayout(DEMO_CAST)
  const first = layout.folderAt('wren:todo', 0)
  const second = layout.folderAt('wren:todo', 1)
  assert.equal(first.x, second.x)
  assert.ok(second.y > first.y)
})
