// The line on the invite page about what is shared. It never says "nothing is shared" when the page does not know it:
// a person who is not signed in gets "Accept to see what is shared with you" instead. Pure. Run:
//   node --import tsx --test tests/invite-share-line.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { shareLine } from '../app/utils/inviteShareLine'

test('signed in, nothing shared: the nothing-shared sentence, with the organisation', () => {
  assert.equal(
    shareLine({ count: 0, signedIn: true, organizationName: 'Org' }),
    'Nothing is shared with you yet by Org. Their projects show here as soon as they share one.'
  )
})

test('not signed in: the page does not claim nothing is shared', () => {
  assert.equal(
    shareLine({ count: 0, signedIn: false, organizationName: 'Org' }),
    'Accept to see what is shared with you.'
  )
})

test('something shared: no line about nothing', () => {
  assert.equal(shareLine({ count: 1, signedIn: true, organizationName: 'Org' }), null)
  assert.equal(shareLine({ count: 2, signedIn: false, organizationName: 'Org' }), null)
})
