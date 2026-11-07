// The "Connect your Claude to this board" window, without a database: how a window request is read into
// per-board grants, what the token may do in total, and the copy-paste prompt the agent is given. Run:
//   node --import tsx --test tests/connect-window.test.ts
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createError } from 'h3'
import { readBoardGrants, scopesOfGrants } from '../server/utils/connectTokenRules'
import { CONNECT_METHODS, connectPrompt, permissionName } from '../app/utils/connectPrompt'

Object.assign(globalThis, { createError })

const ORIGIN = 'https://tasks.example.com'

function refusedWith(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    return (error as { message: string }).message
  }
  return 'no refusal'
}

describe('reading the boards of a window request', () => {
  test('each board keeps the permissions it was given', () => {
    const grants = readBoardGrants([
      { projectId: 'b1', scopes: ['boards:read'] },
      { projectId: 'b2', scopes: ['boards:read', 'boards:write'] }
    ])
    assert.deepEqual(grants, { b1: ['boards:read'], b2: ['boards:read', 'boards:write'] })
  })

  test('a permission listed twice counts once', () => {
    assert.deepEqual(readBoardGrants([{ projectId: 'b1', scopes: ['boards:read', 'boards:read'] }]), { b1: ['boards:read'] })
  })

  test('a board without any permission is refused, not silently dropped', () => {
    assert.match(refusedWith(() => readBoardGrants([{ projectId: 'b1', scopes: [] }])), /at least one permission/)
  })

  test('an unknown permission is refused', () => {
    assert.match(refusedWith(() => readBoardGrants([{ projectId: 'b1', scopes: ['boards:delete'] }])), /not known/)
  })

  test('a board listed twice is refused', () => {
    assert.match(refusedWith(() => readBoardGrants([
      { projectId: 'b1', scopes: ['boards:read'] },
      { projectId: 'b1', scopes: ['boards:write'] }
    ])), /listed twice/)
  })

  test('no boards at all is refused, and so is a request that is not a list', () => {
    assert.match(refusedWith(() => readBoardGrants([])), /at least one board/)
    assert.match(refusedWith(() => readBoardGrants(undefined)), /Pick the boards/)
    assert.match(refusedWith(() => readBoardGrants([{ scopes: ['boards:read'] }])), /must be ids/)
  })
})

describe('what the token may do in total', () => {
  test('it is the union of the boards, in the order the permissions are listed', () => {
    assert.deepEqual(
      scopesOfGrants({ b1: ['secrets:read'], b2: ['boards:write'], b3: ['boards:read', 'boards:write'] }),
      ['boards:read', 'boards:write', 'secrets:read']
    )
  })
})

describe('the copy-paste prompt', () => {
  const boards = [
    { name: 'Office', workspace: 'Personal', scopes: ['boards:read', 'boards:write'] },
    { name: 'Launch', workspace: 'Acme', scopes: ['boards:read'] }
  ]

  test('a code prompt carries the code, the boards with their permissions, and the exchange, and never a token', () => {
    const prompt = connectPrompt({
      origin: ORIGIN,
      tokenName: 'Laptop',
      boards,
      access: { kind: 'code', code: 'tm-pair-ABCD-EFGH', expiresAt: Date.UTC(2026, 10, 7, 22, 0) }
    })
    assert.match(prompt, /Connect to my Taskmanager at https:\/\/tasks\.example\.com/)
    assert.match(prompt, /Office \(Personal\): Read boards and tasks; Change tasks/)
    assert.match(prompt, /Launch \(Acme\): Read boards and tasks/)
    assert.match(prompt, /tm-pair-ABCD-EFGH/)
    assert.match(prompt, new RegExp(`${ORIGIN}/api/pair`))
    assert.match(prompt, /TASKMANAGER_API_KEY/)
    assert.match(prompt, /stop\. Do not retry with this key/)
  })

  test('a token prompt carries the token and no pairing step', () => {
    const prompt = connectPrompt({
      origin: ORIGIN,
      tokenName: 'Laptop',
      boards,
      access: { kind: 'token', token: 'arn_example_token_value' }
    })
    assert.match(prompt, /arn_example_token_value/)
    assert.doesNotMatch(prompt, /api\/pair/)
    assert.doesNotMatch(prompt, /tm-pair-/)
  })

  test('the crew line appears only when a board may be managed as a crew', () => {
    const plain = connectPrompt({ origin: ORIGIN, tokenName: 't', boards, access: { kind: 'token', token: 'arn_x' } })
    assert.doesNotMatch(plain, /shadow board/)
    const crew = connectPrompt({
      origin: ORIGIN,
      tokenName: 't',
      boards: [{ name: 'Crew', workspace: 'Acme', scopes: ['crews:manage'] }],
      access: { kind: 'token', token: 'arn_x' }
    })
    assert.match(crew, /shadow board and never writes to the real board/)
  })

  test('permissions have plain names, and an unknown one keeps its scope', () => {
    assert.equal(permissionName('boards:write'), 'Change tasks')
    assert.equal(permissionName('something:else'), 'something:else')
  })
})

describe('browser verification in the window', () => {
  const boards = [{ id: 'board-1', name: 'Office', workspace: 'Personal', scopes: ['boards:read', 'boards:write'] }]

  test('the browser choice is offered and no longer marked coming soon', () => {
    const browser = CONNECT_METHODS.find(method => method.value === 'browser')
    assert.ok(browser)
    assert.equal('disabled' in browser, false)
    assert.doesNotMatch(browser.description, /Coming soon/)
  })

  test('the browser prompt carries the address and the boards, and no secret', () => {
    const prompt = connectPrompt({ origin: ORIGIN, tokenName: 'Laptop', boards, access: { kind: 'browser' } })
    assert.match(prompt, new RegExp(`${ORIGIN}/api/pair/device`))
    assert.match(prompt, new RegExp(`${ORIGIN}/api/pair/device/poll`))
    assert.match(prompt, /"boardId":"board-1"/)
    assert.match(prompt, /"client_name":"Laptop"/)
    assert.match(prompt, /verification_url/)
    assert.match(prompt, /TASKMANAGER_API_KEY/)
    assert.doesNotMatch(prompt, /tm-pair-/)
    assert.doesNotMatch(prompt, /arn_/)
    assert.doesNotMatch(prompt, /api\/pair\b(?!\/)/, 'the code exchange is not part of the browser flow')
  })

  test('the browser prompt quotes a client name with a single quote safely for the shell', () => {
    const prompt = connectPrompt({ origin: ORIGIN, tokenName: 'Ann\'s laptop', boards, access: { kind: 'browser' } })
    assert.match(prompt, /"client_name":"Ann'\\''s laptop"/)
  })

  test('the browser prompt keeps the refusal line for the agent', () => {
    const prompt = connectPrompt({ origin: ORIGIN, tokenName: 'Laptop', boards, access: { kind: 'browser' } })
    assert.match(prompt, /do not retry/)
    assert.match(prompt, /report it to your main agent/)
  })
})
