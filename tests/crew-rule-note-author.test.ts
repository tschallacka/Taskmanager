// The author of a crew rule's note is the crew's Boss account, else Pia's, never the board owner.
// Run: TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json node --import tsx --test tests/crew-rule-note-author.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { noteAuthorFor } from '../server/utils/crewRules.ts'

test('a crew rule note is written by the crew Boss account', () => {
  const members = new Map([['boss', 'acct-cato'], ['pia', 'acct-pia']])
  assert.equal(noteAuthorFor(members), 'acct-cato')
})

test('with no Boss account, the note goes to Pia', () => {
  const members = new Map([['pia', 'acct-pia']])
  assert.equal(noteAuthorFor(members), 'acct-pia')
})

test('a board with no Pia among its members gets the Boss account, never the owner', () => {
  const members = new Map([['boss', 'acct-cato'], ['usher', 'acct-usher']])
  assert.equal(noteAuthorFor(members), 'acct-cato')
})

test('a board with neither Boss nor Pia gets no author (the note is skipped), never the owner', () => {
  const members = new Map([['usher', 'acct-usher'], ['nina', 'acct-nina']])
  assert.equal(noteAuthorFor(members), null)
})
