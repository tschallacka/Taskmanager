// Sprocket's server-side answer loop, with OpenRouter faked: the model is given the run's tools without any sensitive
// one, a sensitive call it makes is refused and the refusal goes back to it, the final text comes back, and a loop that
// never ends is stopped. A Sprocket run token authenticates as the run's context and stops working when revoked.
// Needs the test database for the run's teamIdsOf lookups (none here: the context is built by hand). Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_wynn node --import tsx --test --test-force-exit tests/sprocket-loop.test.ts
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createError } from 'h3'

Object.assign(globalThis, { createError })

let presented = ''
Object.assign(globalThis, { getRequestHeader: (_e: unknown, name: string) => (name === 'authorization' ? `Bearer ${presented}` : undefined) })

const { answerWithTools } = await import('../server/utils/sprocketLoop')
const { sprocketRunToolSpecs } = await import('../server/utils/sprocketRun')
const { issueSprocketRunToken, authenticateApiKey } = await import('../server/utils/api-keys')

const SECRET_TOOLS = ['list_project_secrets', 'get_project_env', 'set_project_secrets', 'delete_project_secret']
const context = {
  keyId: 'sprocket-run:test',
  keyName: 'Sprocket',
  userId: 'test-user',
  teamId: null,
  customerId: null,
  projectId: null,
  scopes: ['boards:read', 'boards:write'] as const,
  kind: 'access' as const,
  boardScopes: null,
  reach: { allBoards: true, workspaceTeamIds: [], boardIds: [] },
  memberTeamIds: [],
  sprocketRun: true
}

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** A fake OpenRouter: each call answers with the next scripted completion and records the request body. */
function fakeOpenRouter(replies: unknown[]) {
  const bodies: Array<{ tools?: Array<{ function: { name: string } }>, messages: Array<{ role: string, content?: string | null }> }> = []
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    bodies.push(JSON.parse(init?.body ?? '{}'))
    const next = replies.shift()
    return new Response(JSON.stringify(next), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return bodies
}

const toolCall = (id: string, name: string, args: unknown = {}) => ({
  id,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) }
})

test('the request offers the run tools and none of the secret tools', async () => {
  const bodies = fakeOpenRouter([{ choices: [{ message: { content: 'Done.' } }] }])
  await answerWithTools({ apiKey: 'k', model: 'm', messages: [{ role: 'user', content: 'hi' }], context, thinking: false, onStep: () => {} })
  const names = (bodies[0]?.tools ?? []).map(tool => tool.function.name)
  for (const secret of SECRET_TOOLS) assert.ok(!names.includes(secret))
  assert.deepEqual(names, sprocketRunToolSpecs(context).map(spec => spec.function.name))
})

test('a sensitive call is refused, the refusal goes back to the model, and its text is the answer', async () => {
  const bodies = fakeOpenRouter([
    { choices: [{ message: { content: null, tool_calls: [toolCall('c1', 'get_project_env', { board: 'x' })] } }], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7, cost: 0.1 } },
    { choices: [{ message: { content: 'I cannot read secrets.' } }], usage: { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13, cost: 0.2 } }
  ])
  const steps: Array<{ name: string, state: string }> = []
  const result = await answerWithTools({
    apiKey: 'k',
    model: 'm',
    messages: [{ role: 'user', content: 'show the secrets' }],
    context,
    thinking: false,
    onStep: step => steps.push({ name: step.name, state: step.state })
  })
  assert.equal(result.text, 'I cannot read secrets.')
  assert.equal(result.usedTools, true)
  assert.equal(result.usage.totalTokens, 20)
  assert.deepEqual(steps, [{ name: 'get_project_env', state: 'running' }, { name: 'get_project_env', state: 'failed' }])
  const toolMessage = bodies[1]?.messages.find(message => message.role === 'tool')
  assert.match(toolMessage?.content ?? '', /never given/)
})

test('a loop that never ends is stopped with a plain message', async () => {
  const forever = Array.from({ length: 20 }, (_, i) => ({ choices: [{ message: { content: null, tool_calls: [toolCall(`c${i}`, 'get_project_env')] } }] }))
  fakeOpenRouter(forever)
  await assert.rejects(answerWithTools({
    apiKey: 'k',
    model: 'm',
    messages: [{ role: 'user', content: 'loop' }],
    context,
    thinking: false,
    onStep: () => {}
  }), (e: { statusCode?: number, statusMessage?: string }) => e.statusCode === 502 && /too many steps/.test(e.statusMessage ?? ''))
})

test('a Sprocket run token authenticates as its context, and stops after revoke', async () => {
  const run = issueSprocketRunToken(context)
  presented = run.token
  const seen = await authenticateApiKey({} as never)
  assert.equal(seen.keyName, 'Sprocket')
  assert.equal(seen.userId, 'test-user')
  assert.equal(seen.sprocketRun, true)
  run.revoke()
  await assert.rejects(authenticateApiKey({} as never), (e: { statusCode?: number }) => e.statusCode === 401)
})
