// The one prompt a Settings key gives: pairing mode carries no key, token mode carries it, a reconnect removes the
// old server before it adds the new one, and the boards are named in plain words. Uses placeholders only, never a key.
// Run: node --import tsx --test tests/key-prompt.test.ts
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { connectPrompt, keyPrompt, KEY_PLACEHOLDER } from '../app/utils/connectPrompt'
import { mcpReplaceCommand } from '../app/utils/agentSetup'

const ORIGIN = 'https://tasks.example.com'
const PLACEHOLDER_TOKEN = 'arn_PLACEHOLDER_NOT_A_KEY'
const boards = [
  { id: 'b1', name: 'Launch plan', workspace: 'Personal', scopes: ['boards:read', 'boards:write'] },
  { id: 'b2', name: 'Website', workspace: 'Acme', scopes: ['boards:read'] }
]

describe('the key prompt', () => {
  test('pairing mode carries the one-time code and no key', () => {
    const prompt = connectPrompt({
      origin: ORIGIN,
      tokenName: 'Claude Code on my laptop',
      boards,
      access: { kind: 'code', code: 'PAIR-CODE-EXAMPLE', expiresAt: Date.UTC(2026, 10, 9, 12) }
    })
    assert.ok(prompt.includes('PAIR-CODE-EXAMPLE'))
    assert.ok(prompt.includes(`${ORIGIN}/api/pair`))
    assert.ok(!prompt.includes(PLACEHOLDER_TOKEN))
    assert.ok(!/arn_[A-Za-z0-9_-]{10,}/.test(prompt), 'no key is written into a pairing prompt')
  })

  test('token mode carries the token it is given, and no pairing step', () => {
    const prompt = connectPrompt({
      origin: ORIGIN,
      tokenName: 'Claude Code on my laptop',
      boards,
      access: { kind: 'token', token: PLACEHOLDER_TOKEN }
    })
    assert.ok(prompt.includes(PLACEHOLDER_TOKEN))
    assert.ok(!prompt.includes('/api/pair'))
  })

  test('a reconnect removes the old server before the add, and a first setup does not', () => {
    const base = { origin: ORIGIN, tokenName: 'laptop', boards, access: { kind: 'token' as const, token: PLACEHOLDER_TOKEN } }
    const reconnect = connectPrompt({ ...base, replacing: true })
    const remove = reconnect.indexOf('claude mcp remove --scope user taskmanager 2>/dev/null')
    const add = reconnect.indexOf('claude mcp add --scope user --transport http taskmanager')
    assert.ok(remove > -1, 'the reconnect prompt removes the server')
    assert.ok(remove < add, 'the remove comes before the add')
    const first = connectPrompt(base)
    assert.ok(!first.includes('claude mcp remove'), 'a first setup has no remove line')
    assert.ok(first.includes('claude mcp add --scope user --transport http taskmanager'))
  })

  test('the boards are listed with their permissions in plain words', () => {
    const prompt = connectPrompt({
      origin: ORIGIN,
      tokenName: 'laptop',
      boards,
      access: { kind: 'code', code: 'X', expiresAt: 0 }
    })
    assert.ok(prompt.includes('- Launch plan (Personal): Read boards and tasks; Change tasks'))
    assert.ok(prompt.includes('- Website (Acme): Read boards and tasks'))
  })

  test('keyPrompt: pairing is the default and the key is written in only in token mode', () => {
    const pairing = { code: 'PAIR-CODE-EXAMPLE', expiresAt: Date.UTC(2026, 10, 9, 12) }
    const byCode = keyPrompt({ origin: ORIGIN, name: 'laptop', reach: { boards }, pairing, token: PLACEHOLDER_TOKEN, mode: 'code' })
    assert.ok(byCode.includes('PAIR-CODE-EXAMPLE') && !byCode.includes(PLACEHOLDER_TOKEN))
    const byToken = keyPrompt({ origin: ORIGIN, name: 'laptop', reach: { boards }, pairing, token: PLACEHOLDER_TOKEN, mode: 'token' })
    assert.ok(byToken.includes(PLACEHOLDER_TOKEN))
    const noPairing = keyPrompt({ origin: ORIGIN, name: 'laptop', reach: { boards }, pairing: null, token: null, mode: 'code' })
    assert.ok(noPairing.includes(KEY_PLACEHOLDER), 'with no code and no key, the prompt has a placeholder')
    assert.ok(!noPairing.includes(PLACEHOLDER_TOKEN))
  })

  test('the update command removes the old server before the add, and carries the key in the environment', () => {
    const command = mcpReplaceCommand(ORIGIN, PLACEHOLDER_TOKEN)
    const remove = command.indexOf('claude mcp remove --scope user taskmanager 2>/dev/null')
    const add = command.indexOf('claude mcp add --scope user --transport http taskmanager')
    assert.ok(remove > -1, 'the replace command removes the existing server')
    assert.ok(remove < add, 'the remove runs before the add')
    assert.ok(command.includes(`export TASKMANAGER_API_KEY=${PLACEHOLDER_TOKEN}`))
    assert.throws(() => mcpReplaceCommand(ORIGIN, 'not-a-key'), /needs the real key/)
  })

  test('an all-boards key says so in one line, and names its permissions', () => {
    const prompt = connectPrompt({
      origin: ORIGIN,
      tokenName: 'laptop',
      boards: [],
      allBoards: { scopes: ['boards:read'] },
      access: { kind: 'code', code: 'X', expiresAt: 0 }
    })
    assert.ok(prompt.includes('All the boards you can open, including ones the owner gives later: Read boards and tasks'))
    assert.ok(!prompt.includes('- Launch plan'))
  })
})
