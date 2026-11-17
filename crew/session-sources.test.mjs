// A person's session loads only the project and local settings, never the user ones (card mwghrx2k8dwf8h93say): the user
// settings on this host are Boss's, with Boss's example identity, and a session that reads them takes Boss's rules. Its role
// starts with its own key, so it knows who it is. Tests on fake data; no claude is started here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { startArgs } from './session.mjs'
import { resolveStartRole } from './role-file.mjs'

test('a person session starts with the project and local setting sources, and no user source', () => {
  for (const key of ['wick', 'nina', 'pia']) {
    const { args } = startArgs({ key, folder: '/tmp', home: '/h', kit: '/k', role: 'r' })
    const at = args.indexOf('--setting-sources')
    assert.ok(at >= 0, `${key}: the flag is there`)
    assert.equal(args[at + 1], 'project,local', `${key}: project and local only`)
    assert.ok(!args.includes('user'), `${key}: no user source anywhere in the argv`)
  }
})

test('the identity line names the person key first, in a worker role', () => {
  const prompts = '## Worker (key W, NICK)\n```\nYou are W, NICK.\nWork on your card.\n```\n'
  const { role } = resolveStartRole({ home: '/h', key: 'wick', promptsText: prompts, crewText: '', env: {} })
  assert.ok(role.startsWith('Your key is wick. Run only crew wick'), 'the first line names the key')
  assert.match(role, /Never run crew boss or crew pm\. Every post is under your own name\./)
  assert.equal(role.split('Your key is wick.').length - 1, 1, 'the line is there once')
})

test('the identity line names the key of a person with a role file of their own', () => {
  const home = mkdtempSync(join(tmpdir(), 'role-own-'))
  mkdirSync(join(home, 'sessions'), { recursive: true })
  writeFileSync(join(home, 'sessions', 'nina.role.md'), 'You are Nina.\n')
  const { role } = resolveStartRole({ home, key: 'nina', promptsText: '', crewText: '', env: {} })
  assert.ok(role.startsWith('Your key is nina. Run only crew nina'))
  assert.match(role, /You are Nina\./, 'the role file text is kept')
})

test('the identity line is also first when the role comes from CREW_ROLE_FILE', () => {
  const home = mkdtempSync(join(tmpdir(), 'role-env-'))
  const file = join(home, 'role.md')
  writeFileSync(file, 'Custom role.\n')
  const { role } = resolveStartRole({ home, key: 'pat', promptsText: '', crewText: '', env: { CREW_ROLE_FILE: file } })
  assert.ok(role.startsWith('Your key is pat. Run only crew pat'))
  assert.match(role, /Custom role\./)
})
