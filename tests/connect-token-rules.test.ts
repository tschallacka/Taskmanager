// The rules of a token that need no database: the refusals a stale token gets, expiry, and what each board
// may do. Run:
//   node --import tsx --test tests/connect-token-rules.test.ts
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TOKEN_REFUSAL_MESSAGES,
  boardScopesOf,
  boardsGranting,
  copyBoardScopes,
  isTokenExpired,
  scopesOnBoard,
  tokenRefusal
} from '../server/utils/connectTokenRules'

const AGENT_LINE = 'If you are an agent or subagent, pass this along to your main agent so they can ask the user for a new token. Do not retry with this token.'

describe('refusals of a stale token', () => {
  test('each refusal says what happened, in plain text, with the line for the main agent', () => {
    for (const message of Object.values(TOKEN_REFUSAL_MESSAGES)) {
      assert.ok(message.endsWith(AGENT_LINE), message)
    }
    assert.match(TOKEN_REFUSAL_MESSAGES.token_regenerated, /^This token has been regenerated\. Please enter the new token\./)
    assert.match(TOKEN_REFUSAL_MESSAGES.token_revoked, /^This token has been revoked/)
    assert.match(TOKEN_REFUSAL_MESSAGES.token_expired, /^This token has expired\./)
  })

  test('a refusal is a 401 that carries its stable code and the sentence', () => {
    for (const code of ['token_regenerated', 'token_revoked', 'token_expired'] as const) {
      const refusal = tokenRefusal(code)
      assert.equal(refusal.statusCode, 401)
      assert.equal(refusal.message, TOKEN_REFUSAL_MESSAGES[code])
      assert.deepEqual(refusal.data, { code })
    }
  })
})

describe('expiry', () => {
  test('a token with no expiry never runs out', () => {
    assert.equal(isTokenExpired(null, Date.now()), false)
    assert.equal(isTokenExpired(undefined, Date.now()), false)
  })

  test('a token is expired from its expiry moment on', () => {
    const at = 1_000_000
    assert.equal(isTokenExpired(at + 1, at), false)
    assert.equal(isTokenExpired(at, at), true)
    assert.equal(isTokenExpired(at - 1, at), true)
  })
})

describe('scope per board', () => {
  test('rows are grouped per board and an unknown permission is dropped', () => {
    const grants = boardScopesOf([
      { projectId: 'a', scope: 'boards:read' },
      { projectId: 'a', scope: 'boards:write' },
      { projectId: 'a', scope: 'boards:read' },
      { projectId: 'b', scope: 'not-a-scope' },
      { projectId: 'b', scope: 'secrets:read' }
    ])
    assert.deepEqual(grants, { a: ['boards:read', 'boards:write'], b: ['secrets:read'] })
  })

  test('without per-board grants every board gets the token scopes', () => {
    assert.deepEqual(scopesOnBoard(['boards:read', 'boards:write'], null, 'any'), ['boards:read', 'boards:write'])
  })

  test('with per-board grants a board gets only what is ticked for it, never more than the token carries', () => {
    const grants = { a: ['boards:read', 'secrets:read'] as const, b: ['boards:write'] as const }
    const token = ['boards:read', 'boards:write'] as const
    assert.deepEqual(scopesOnBoard([...token], { a: [...grants.a], b: [...grants.b] }, 'a'), ['boards:read'])
    assert.deepEqual(scopesOnBoard([...token], { a: [...grants.a], b: [...grants.b] }, 'b'), ['boards:write'])
    assert.deepEqual(scopesOnBoard([...token], { a: [...grants.a], b: [...grants.b] }, 'unlisted'), [])
  })

  test('adding a board copies the permissions of another board and leaves the others as they were', () => {
    const before = { a: ['boards:read', 'boards:write'] as const }
    const after = copyBoardScopes({ a: [...before.a] }, 'a', 'new')
    assert.deepEqual(after, { a: ['boards:read', 'boards:write'], new: ['boards:read', 'boards:write'] })
    after.new!.push('secrets:read')
    assert.deepEqual(after.a, ['boards:read', 'boards:write'])
  })

  test('a call reaches the boards whose grant includes its permission; no per-board grant narrows nothing', () => {
    const token = ['boards:read', 'boards:write'] as const
    assert.equal(boardsGranting([...token], null, 'boards:write'), null)
    const grants = { a: ['boards:read'], b: ['boards:read', 'boards:write'] } as const
    const copy = () => ({ a: [...grants.a], b: [...grants.b] })
    assert.deepEqual(boardsGranting([...token], copy(), 'boards:read'), ['a', 'b'])
    assert.deepEqual(boardsGranting([...token], copy(), 'boards:write'), ['b'])
    assert.deepEqual(boardsGranting([...token], copy(), undefined), [])
  })

  test('copying from a board with no grants gives the new board none', () => {
    assert.deepEqual(copyBoardScopes({}, 'missing', 'new'), { new: [] })
  })
})
