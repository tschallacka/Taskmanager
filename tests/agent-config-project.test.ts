// The folder form, as Boss and the owner ruled on mwepy5fzg2i0jdvue7: a project .mcp.json whose server header reads
// ${VAR}, a .claude/settings.local.json env block that sets VAR (merged, never replacing the user's own settings), both
// files excluded from git and not committed, no user scope, no shell profile, no headersHelper. The server is named
// taskmanager-<key slug>, the variable TASKMANAGER_<KEY SLUG>. Pure. Run:
//   node --import tsx --test tests/agent-config-project.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { keyNameSuffix, mergeSettingsLocal, projectMcpText, projectServerName, projectSetupText, projectVariableName, settingsLocalText } from '../app/utils/agentConfig'

const ORIGIN = 'https://tm.example.test'

test('the project server is named for the key, and its variable is the key slug in capitals', () => {
  assert.equal(projectServerName('Wynn laptop'), 'taskmanager-wynn-laptop')
  assert.equal(projectVariableName('Wynn laptop'), 'TASKMANAGER_WYNN_LAPTOP')
  assert.notEqual(projectServerName('Wynn laptop'), 'taskmanager', 'never the bare name')
})

test('the .mcp.json header reads the variable and holds no key value', () => {
  const text = projectMcpText(ORIGIN, 'Wynn laptop')
  const config = JSON.parse(text)
  assert.deepEqual(Object.keys(config.mcpServers), ['taskmanager-wynn-laptop'])
  assert.equal(config.mcpServers['taskmanager-wynn-laptop'].headers.Authorization, 'Bearer ${TASKMANAGER_WYNN_LAPTOP}')
  assert.doesNotMatch(text, /arn_/, 'no key value in the file')
  assert.doesNotMatch(text, /headersHelper/, 'headersHelper is not used')
})

test('the settings.local.json env block carries the key under the variable', () => {
  const config = JSON.parse(settingsLocalText('Wynn laptop', 'arn_keyWYNN1111'))
  assert.deepEqual(config, { env: { TASKMANAGER_WYNN_LAPTOP: 'arn_keyWYNN1111' } })
})

test('merging into an existing settings.local.json keeps the user\'s own keys and env entries', () => {
  const existing = JSON.stringify({ permissions: { allow: ['Bash(ls)'] }, env: { OTHER: 'kept' } })
  const merged = JSON.parse(mergeSettingsLocal(existing, 'Wynn laptop', 'arn_keyWYNN1111'))
  assert.deepEqual(merged.permissions, { allow: ['Bash(ls)'] }, 'other settings kept')
  assert.equal(merged.env.OTHER, 'kept', 'other env kept')
  assert.equal(merged.env.TASKMANAGER_WYNN_LAPTOP, 'arn_keyWYNN1111')
})

test('two keys give two different files, and neither contains the other key', () => {
  const a = projectMcpText(ORIGIN, 'Key One') + settingsLocalText('Key One', 'arn_keyAAAA1111')
  const b = projectMcpText(ORIGIN, 'Key Two') + settingsLocalText('Key Two', 'arn_keyBBBB2222')
  assert.notEqual(projectMcpText(ORIGIN, 'Key One'), projectMcpText(ORIGIN, 'Key Two'))
  assert.notEqual(projectServerName('Key One'), projectServerName('Key Two'))
  assert.notEqual(projectVariableName('Key One'), projectVariableName('Key Two'))
  assert.doesNotMatch(a, /arn_keyBBBB2222/)
  assert.doesNotMatch(b, /arn_keyAAAA1111/)
})

test('the setup always has the git exclude step for both files, and says not to commit them', () => {
  const text = projectSetupText(ORIGIN, 'Wynn laptop')
  assert.match(text, /\.git\/info\/exclude/)
  assert.match(text, /\.mcp\.json/)
  assert.match(text, /\.claude\/settings\.local\.json/)
  assert.match(text, /do not commit/i)
})

test('the setup says Claude Code asks to approve the project server, and that claude mcp list is not the check', () => {
  const text = projectSetupText(ORIGIN, 'Wynn laptop')
  assert.match(text, /approve/i)
  assert.match(text, /claude mcp list/i, 'it names the command it does not trust')
  assert.match(text, /\/mcp/, 'the check is /mcp inside a session')
})

test('the reconnect is a new session first (claude --continue keeps the conversation), /mcp reconnect only as try first', () => {
  const text = projectSetupText(ORIGIN, 'Wynn laptop')
  assert.match(text, /claude --continue/)
  const newSession = text.indexOf('claude --continue')
  const tryFirst = text.indexOf('/mcp reconnect')
  assert.ok(tryFirst > newSession, '/mcp reconnect is named after the new-session step, as a try first')
  assert.match(text, /try first/i)
})

test('no generated text writes to user scope, to the shell profile, or uses headersHelper', () => {
  const text = projectSetupText(ORIGIN, 'Wynn laptop') + projectMcpText(ORIGIN, 'Wynn laptop') + settingsLocalText('Wynn laptop', 'arn_x')
  assert.doesNotMatch(text, /mcp add --scope user/, 'no user-scope add')
  assert.doesNotMatch(text, /\.zshrc|\.bashrc|\.profile/, 'no profile edit')
  assert.doesNotMatch(text, /headersHelper/)
})

test('the key panel offers the folder setup as a copy button, built from the key label', () => {
  const panel = readFileSync(new URL('../app/components/ApiKeysPanel.vue', import.meta.url), 'utf8')
  assert.match(panel, /'Copy folder setup'/)
  assert.match(panel, /projectSetupText\(window\.location\.origin, issuedName\.value, issuedSuffix\.value\)/)
})

test('two keys whose names slug the same get -2 and -3 by creation order, so their server names and variables differ', () => {
  const first = { id: 'k1', name: 'Wren Worker', createdAt: 1000 }
  const second = { id: 'k2', name: 'wren-worker', createdAt: 2000 }
  assert.equal(keyNameSuffix(first, [first, second]), '', 'the earlier key keeps the plain slug')
  assert.equal(keyNameSuffix(second, [first, second]), '-2', 'the later key gets -2')
  assert.equal(projectServerName(first.name, keyNameSuffix(first, [first, second])), 'taskmanager-wren-worker')
  assert.equal(projectServerName(second.name, keyNameSuffix(second, [first, second])), 'taskmanager-wren-worker-2')
  assert.equal(projectVariableName(second.name, '-2'), 'TASKMANAGER_WREN_WORKER_2')
  assert.notEqual(projectServerName(first.name), projectServerName(second.name, '-2'))
  assert.notEqual(projectVariableName(first.name), projectVariableName(second.name, '-2'))
})

test('the suffix is stable: it depends on creation order, not on the order of the list', () => {
  const first = { id: 'k1', name: 'Wren Worker', createdAt: 1000 }
  const second = { id: 'k2', name: 'wren-worker', createdAt: 2000 }
  const third = { id: 'k3', name: 'WREN WORKER', createdAt: 3000 }
  assert.equal(keyNameSuffix(second, [third, second, first]), '-2')
  assert.equal(keyNameSuffix(third, [second, third, first]), '-3')
  assert.equal(keyNameSuffix(first, [third, first, second]), '')
})

test('the key panel uses the suffix for the new key and its files, and no longer refuses a name', () => {
  const panel = readFileSync(new URL('../app/components/ApiKeysPanel.vue', import.meta.url), 'utf8')
  assert.match(panel, /keyNameSuffix\(/, 'the panel derives the suffix from the key list')
  assert.doesNotMatch(panel, /nameTaken/, 'the refusal rule is gone')
})

test('the one remove line is optional, and it is only for an old bare user-scope entry', () => {
  const text = projectSetupText(ORIGIN, 'Wynn laptop')
  assert.match(text, /optional/i)
  assert.match(text, /claude mcp remove --scope user taskmanager/)
})
