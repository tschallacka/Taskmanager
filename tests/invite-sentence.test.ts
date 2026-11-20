// The words of the invite page: who is inviting whom to what, and the email only when no name is known.
// Pure: no database, no server. Run: node --import tsx --test tests/invite-sentence.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { inviteSentence, truncateName } from '../app/utils/inviteSentence'

const org = 'Tschallacka\'s Organisation'

test('a project invite with a name says what is shared, with whom', () => {
  const words = inviteSentence({ kind: 'project', org, project: 'Garden plan', name: 'Ada', email: 'ada@example.com' })
  assert.equal(words.headline, 'Welcome, Ada')
  assert.equal(words.sentence, 'Tschallacka\'s Organisation shares Garden plan with you, Ada: follow the progress and work together.')
  assert.equal(words.button, 'Join Garden plan')
  assert.equal(words.footnote, null, 'with a name the email is not shown')
})

test('a project invite without a name shows the email under the button', () => {
  const words = inviteSentence({ kind: 'project', org, project: 'Garden plan', name: null, email: 'ada@example.com' })
  assert.equal(words.headline, 'Welcome')
  assert.equal(words.sentence, 'Tschallacka\'s Organisation shares Garden plan with you: follow the progress and work together.')
  assert.equal(words.button, 'Join Garden plan')
  assert.equal(words.footnote, 'Invitation for ada@example.com')
})

test('a team invite with a name names the person and the organisation', () => {
  const words = inviteSentence({ kind: 'team', org, name: 'Ada', email: 'ada@example.com' })
  assert.equal(words.headline, 'Welcome, Ada')
  assert.equal(words.sentence, 'Tschallacka\'s Organisation invites you, Ada, to join the team and work together.')
  assert.equal(words.button, 'Join Tschallacka\'s Organisation')
  assert.equal(words.footnote, null)
})

test('a team invite without a name, and the email only as a footnote', () => {
  const words = inviteSentence({ kind: 'team', org, name: null, email: 'ada@example.com' })
  assert.equal(words.headline, 'Welcome')
  assert.equal(words.sentence, 'Tschallacka\'s Organisation invites you to join the team and work together.')
  assert.equal(words.footnote, 'Invitation for ada@example.com')
})

test('a blank name counts as no name', () => {
  const words = inviteSentence({ kind: 'team', org, name: '   ', email: 'ada@example.com' })
  assert.equal(words.headline, 'Welcome')
  assert.equal(words.footnote, 'Invitation for ada@example.com')
})

test('a link invitation has no address: no name and an empty email gives no footnote, never "Invitation for "', () => {
  const words = inviteSentence({ kind: 'team', org, name: null, email: '' })
  assert.equal(words.headline, 'Welcome')
  assert.equal(words.footnote, null)
})

test('a long name is cut with an ellipsis, and a short one is kept whole', () => {
  const long = 'A'.repeat(80)
  const cut = truncateName(long, 40)
  assert.equal(cut.length, 40)
  assert.ok(cut.endsWith('…'))
  assert.equal(truncateName('Ada', 40), 'Ada')
  const words = inviteSentence({ kind: 'project', org, project: 'P'.repeat(80), name: long, email: 'a@b.c' })
  assert.ok(words.headline.endsWith('…'))
  assert.ok(words.button.length <= 'Join '.length + 60)
})
