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

test('the invite page says the same sentence for a withdrawn (not found) or revoked link', () => {
  const page = read('app/pages/invite/[token].vue')
  assert.match(page, new RegExp(WORDING.replace(/\./g, '\\.')))
  assert.doesNotMatch(page, /This invitation link is not valid/)
})
