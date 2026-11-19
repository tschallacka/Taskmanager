// One wording for a link that was withdrawn or revoked (Usher's UX finding): the lookup tells a revoked team or board link
// apart from a used one, the server answers it the same way for every kind, and the invite page says one sentence for
// a withdrawn (not found) or revoked link. Source level.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const WORDING = 'This invitation was withdrawn or revoked. Ask for a new link.'

test('the lookup says a revoked team invitation is revoked, not used', () => {
  const lookup = read('server/utils/invitations.ts')
  assert.match(lookup, /export type InvitationProblem = 'missing' \| 'used' \| 'expired' \| 'revoked'/)
  assert.match(lookup, /if \(team\.revokedAt\) return 'revoked'/)
  assert.doesNotMatch(lookup, /if \(team\.acceptedAt \|\| team\.revokedAt\) return 'used'/)
})

test('the preview and the accept route answer a revoked link with the same sentence', () => {
  const preview = read('server/api/invitations/[token]/index.get.ts')
  assert.match(preview, /addressed === 'revoked'/)
  assert.match(preview, /This invitation was withdrawn or revoked\./)
  const accept = read('server/api/invitations/[token]/accept.post.ts')
  assert.match(accept, /addressed === 'revoked'/)
})

test('the customer link answers the same sentence as the team and board links', () => {
  const preview = read('server/api/invitations/[token]/index.get.ts')
  assert.match(preview, /if \(row\.revokedAt\) throw createError\(\{ statusCode: 410, message: '[^']*withdrawn or revoked/)
})

test('a withdrawn board-guest link is its own problem, not used, and gets its own server message', () => {
  const lookup = read('server/utils/invitations.ts')
  assert.match(lookup, /export type InvitationProblem = 'missing' \| 'used' \| 'expired' \| 'revoked' \| 'withdrawn'/)
  assert.match(lookup, /if \(board\.status === 'revoked'\) return 'withdrawn'/)
  const preview = read('server/api/invitations/[token]/index.get.ts')
  assert.match(preview, /addressed === 'withdrawn'\) throw createError\(\{ statusCode: 410, message: 'This board invitation was withdrawn\.' \}\)/)
  const accept = read('server/api/invitations/[token]/accept.post.ts')
  assert.match(accept, /addressed === 'withdrawn'/)
})

test('a link that does not exist is a 404 that says the link is not valid, not that it was withdrawn', () => {
  const preview = read('server/api/invitations/[token]/index.get.ts')
  assert.match(preview, /statusCode: 404, message: 'This invitation link is not valid'/)
  assert.doesNotMatch(preview, /This invitation does not exist/)
})

test('the invite page: a 404 says the link is not valid; only a withdrawn 410 says it was withdrawn', () => {
  const page = read('app/pages/invite/[token].vue')
  assert.match(page, /status === 404\) return 'This invitation link is not valid\.'/)
  const withdrawn = page.slice(page.indexOf('WITHDRAWN_MESSAGES.includes'), page.indexOf('if (status === 410) return'))
  assert.doesNotMatch(withdrawn, /404/, 'a 404 is not a withdrawn link')
  assert.match(page, /const WITHDRAWN_MESSAGES = \['This invitation was withdrawn or revoked\.', 'This board invitation was withdrawn\.'\]/)
  assert.match(page, new RegExp(WORDING.replace(/\./g, '\\.')))
})
