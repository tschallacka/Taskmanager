// One desk per person in the office, even when a card is assigned to the crew's own account and that person
// also has a fork on the board. Pure, with the seating rule of server/utils/officeCast.ts. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/office-duplicate-desk.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seatOwnAccounts } from '../server/utils/officeCast'
import type { OfficePerson } from '../shared/office/model'

const keyOf = (email: string) => email.split('@')[0]!

// The seated forks: Wade and Usher forked for this board.
const seated: OfficePerson[] = [
  { userId: 'fork-wade', key: 'wade', name: 'Wade Worker (Taskmanager)', role: 'worker' },
  { userId: 'fork-usher', key: 'usher', name: 'Usher Xander (Taskmanager)', role: 'ux' }
]
const forkIds = new Set(['fork-wade', 'fork-usher'])

test('an own account whose person already has a fork on the board takes no second desk', () => {
  const accounts = [
    { id: 'own-wade', email: 'wade@crew.test', name: 'Wade Worker' },
    { id: 'own-usher', email: 'usher@crew.test', name: 'Usher Xander' }
  ]
  const { added, aliases } = seatOwnAccounts(seated, accounts, forkIds, keyOf)
  assert.deepEqual(added, [])
  assert.deepEqual(aliases, { 'own-wade': 'fork-wade', 'own-usher': 'fork-usher' })
})

test('a fork account is not an alias of itself', () => {
  const accounts = [{ id: 'fork-wade', email: 'wade@crew.test', name: 'Wade Worker (Taskmanager)' }]
  const { added, aliases } = seatOwnAccounts(seated, accounts, forkIds, keyOf)
  assert.deepEqual(added, [])
  assert.deepEqual(aliases, {})
})

test('an own account nobody has forked takes its own desk, once', () => {
  const accounts = [
    { id: 'own-boss', email: 'boss@crew.test', name: 'Boss' },
    { id: 'own-boss-2', email: 'boss@crew.test', name: 'Boss again' }
  ]
  const { added, aliases } = seatOwnAccounts(seated, accounts, forkIds, keyOf)
  assert.deepEqual(added.map(p => [p.userId, p.key, p.role]), [['own-boss', 'boss', 'boss']])
  assert.deepEqual(aliases, { 'own-boss-2': 'own-boss' })
})

test('an account with no address is never seated', () => {
  const { added, aliases } = seatOwnAccounts(seated, [{ id: 'own-x', email: '', name: 'Nobody' }], forkIds, keyOf)
  assert.deepEqual(added, [])
  assert.deepEqual(aliases, {})
})
