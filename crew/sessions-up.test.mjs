// `crew up` and `crew down` for the recorded person sessions, with fakes (no real claude, no real typing). Run:
//   node --test crew/sessions-up.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downSessions, recordedKeys, upSessions, workerRole, RESTART_WAKE } from './sessions-up.mjs'

const PROMPTS = [
  '# Launch prompts',
  '',
  '## Worker (key `wren`, `wick`, `wynn` or `wade`; replace W and NICK)',
  '',
  '```',
  'You are a worker (key `W`, chat nick `NICK`). Run your listening loop: listen.mjs W 60 and work in work/W/.',
  '```',
  '',
  '## PM (Pia Planner)',
  '',
  '```',
  'You are Pia.',
  '```',
  ''
].join('\n')

const LIVE_ID = 'bb000002'
const DEAD_ID = 'aa000001'

function homeWith(records) {
  const home = mkdtempSync(join(tmpdir(), 'sessions-up-home-'))
  mkdirSync(join(home, 'sessions'), { recursive: true })
  for (const [key, rec] of Object.entries(records)) {
    writeFileSync(join(home, 'sessions', `${key}.json`), JSON.stringify(rec))
  }
  return home
}

const agents = [{ id: LIVE_ID, name: 'wick', state: 'idle', status: 'running', startedAt: 1 }]

test('the worker role is the PROMPTS.md worker block, with the key and the nick filled in', () => {
  const role = workerRole(PROMPTS, 'wren')
  assert.match(role, /^You are a worker \(key `wren`, chat nick `Wren Worker`\)\. Run your listening loop: listen\.mjs wren 60 and work in work\/wren\/\.\n$/)
  assert.equal(workerRole(PROMPTS, 'pia'), null, 'a key with no worker role gets none')
  assert.equal(workerRole('no block here', 'wick'), null)
})

test('the recorded keys are the session records, not the mcp configs', () => {
  const home = homeWith({ wren: { id: DEAD_ID }, wick: { id: LIVE_ID } })
  writeFileSync(join(home, 'sessions', 'wren.mcp.json'), '{}')
  assert.deepEqual(recordedKeys(home), ['wick', 'wren'])
})

test('crew up starts a recorded session that is not running, wakes it once, and leaves a running one alone', async () => {
  const home = homeWith({ wren: { id: DEAD_ID, folder: '/work/wren' }, wick: { id: LIVE_ID, folder: '/work/wick' } })
  const started = []
  const woken = []
  const out = await upSessions(home, {
    promptsText: PROMPTS,
    listAgents: () => agents,
    start: ({ key, folder, role }) => { started.push({ key, folder, role }); return { ok: true, id: 'cc000003' } },
    wake: async ({ key, id, text }) => { woken.push({ key, id, text }); return { ok: true, reason: 'woke' } }
  })
  assert.deepEqual(out.lines, ['wick: already running (bb000002)', 'wren: started (cc000003), woke once'])
  assert.equal(out.ok, true)
  assert.equal(started.length, 1, 'only the one that was not running is started')
  assert.equal(started[0].folder, '/work/wren', 'the start uses the recorded folder')
  assert.match(started[0].role, /chat nick `Wren Worker`/)
  assert.deepEqual(woken, [{ key: 'wren', id: 'cc000003', text: RESTART_WAKE }])
})

test('crew up refuses a recorded id that is not a session id, and starts nothing for it', async () => {
  const evil = 'a1b2c3d4;touch /tmp/pwned'
  const home = homeWith({ wren: { id: evil, folder: '/work/wren' } })
  let started = 0
  const out = await upSessions(home, { promptsText: PROMPTS, listAgents: () => [], start: () => { started += 1; return { ok: true } }, wake: async () => ({ ok: true }) })
  assert.equal(started, 0)
  assert.equal(out.ok, false)
  assert.match(out.lines[0], /not a session id/)
})

test('crew up reports a key with no worker role as failed, and does not start it with a guessed role', async () => {
  const home = homeWith({ pia: { id: DEAD_ID, folder: '/work/pia' } })
  let started = 0
  const out = await upSessions(home, { promptsText: PROMPTS, listAgents: () => [], start: () => { started += 1; return { ok: true } }, wake: async () => ({ ok: true }) })
  assert.equal(started, 0)
  assert.equal(out.lines[0], 'pia: failed: no worker role for this key; not started')
  assert.equal(out.ok, false)
})

test('crew up says so when the wake is not sent, and the session stays started', async () => {
  const home = homeWith({ wynn: { id: DEAD_ID, folder: '/work/wynn' } })
  const out = await upSessions(home, {
    promptsText: PROMPTS.replace('chat nick `NICK`', 'chat nick `NICK`'),
    listAgents: () => [],
    start: () => ({ ok: true, id: 'cc000004' }),
    wake: async () => ({ ok: false, reason: 'busy' })
  })
  assert.equal(out.lines[0], 'wynn: started (cc000004), wake not sent: busy')
  assert.equal(out.ok, false)
})

test('crew down stops each running recorded session by its id, and says not running for the others', () => {
  const home = homeWith({ wren: { id: DEAD_ID, folder: '/work/wren' }, wick: { id: LIVE_ID, folder: '/work/wick' } })
  const stopped = []
  const out = downSessions(home, {
    listAgents: () => agents,
    stop: ({ key }) => { stopped.push(key); return { ok: true, id: LIVE_ID } }
  })
  assert.deepEqual(stopped, ['wick'])
  assert.deepEqual(out.lines, ['wick: stopped (bb000002)', 'wren: not running'])
  assert.equal(out.ok, true)
})

test('crew down reports a stop that fails, and a metacharacter id is never stopped', () => {
  const home = homeWith({ wick: { id: LIVE_ID, folder: '/work/wick' }, wren: { id: 'x;rm', folder: '/work/wren' } })
  const out = downSessions(home, {
    listAgents: () => agents,
    stop: () => ({ ok: false, reason: 'claude stop failed' })
  })
  assert.equal(out.lines[0], 'wick: failed to stop bb000002: claude stop failed')
  assert.match(out.lines[1], /not a session id; stop it by hand/)
  assert.equal(out.ok, false)
})
