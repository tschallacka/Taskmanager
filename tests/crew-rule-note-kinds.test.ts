// Each crew rule note kind (promotion, time-log check, failing-test clock) takes its author from the crew's Boss
// account, else Pia's, and never from the board owner. The author is decided in sourceFor, so each kind is checked
// through it. Written, not run yet. Run: TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json node --import tsx --test tests/crew-rule-note-kinds.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sourceFor, RULE_PROMOTE, RULE_TIME_LOG, RULE_TEST_CLOCK } from '../server/utils/crewRules.ts'

const KINDS = [RULE_PROMOTE, RULE_TIME_LOG, RULE_TEST_CLOCK]
const OWNER = 'acct-owner'
// The board's project is not part of the author decision; sourceFor only reads the members.
const project = { id: 'board-under-test' } as never

test('promotion, time-log and failing-test clock notes are all authored by the crew Boss account', async () => {
  const members = new Map([['boss', 'acct-cato'], ['pia', 'acct-pia']])
  for (const kind of KINDS) {
    const source = await sourceFor(project, kind, members)
    assert.equal(source.createdBy, 'acct-cato', `${kind} must be written by the Boss account`)
  }
})

test('with no Boss account, promotion, time-log and failing-test clock notes go to Pia', async () => {
  const members = new Map([['pia', 'acct-pia']])
  for (const kind of KINDS) {
    const source = await sourceFor(project, kind, members)
    assert.equal(source.createdBy, 'acct-pia', `${kind} must fall back to Pia`)
  }
})

test('no note kind is ever authored by the board owner, whatever the members', async () => {
  // The owner is never a crew member key, so no combination of members may hand the note to the owner.
  const combinations = [
    new Map<string, string>(),
    new Map([['boss', 'acct-cato']]),
    new Map([['pia', 'acct-pia']]),
    new Map([['boss', 'acct-cato'], ['pia', 'acct-pia']]),
    new Map([['usher', 'acct-usher'], ['nina', 'acct-nina']])
  ]
  for (const members of combinations) {
    for (const kind of KINDS) {
      const source = await sourceFor(project, kind, members)
      assert.notEqual(source.createdBy, OWNER, `${kind} must never be authored by the owner (members: ${[...members.keys()].join(',') || 'none'})`)
    }
  }
})

test('with neither Boss nor Pia, the note has no author (it is skipped), not the owner', async () => {
  const members = new Map([['usher', 'acct-usher']])
  for (const kind of KINDS) {
    const source = await sourceFor(project, kind, members)
    assert.equal(source.createdBy, null, `${kind} must have no author rather than the owner`)
  }
})
