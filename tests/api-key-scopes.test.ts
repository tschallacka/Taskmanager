// A new key's default scopes, and the scope text in the Settings panel. The panel and the connect prompt must name the
// same two board scopes the same way, so a key that gets both (read boards and tasks, change tasks) is what the owner
// reads. Source checks on the panel and the prompt builder. Run:
//   node --import tsx --test tests/api-key-scopes.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const panel = readFileSync(new URL('../app/components/ApiKeysPanel.vue', import.meta.url), 'utf8')
const prompt = readFileSync(new URL('../app/utils/connectPrompt.ts', import.meta.url), 'utf8')

test('a new key selects both board scopes by default: read boards and tasks, and change tasks', () => {
  assert.match(panel, /permission\.scope\.startsWith\('boards:'\)/, 'the default ticks every boards: scope')
})

test('Show prompt and Regenerate use the connect prompt builder, with the placeholder until a regenerate', () => {
  assert.match(panel, /function reachOfKey\(key: ApiKeySummary\)/, 'a listed key\'s reach is read from the key')
  assert.match(panel, /const shownPromptText = computed\(\(\) => \{/, 'the shown prompt is built once')
  assert.match(panel, /keyPrompt\(\{ origin: window\.location\.origin, name: key\.name, reach: reachOfKey\(key\), pairing: null, token: shown\.token, mode: 'token' \}\)/)
  assert.doesNotMatch(panel, /setupCommandFor\(shownPrompt\.token\)/, 'the old command shape is no longer shown')
  assert.match(panel, /\{\{ shownPromptText \}\}/, 'the template shows the shared builder')
  assert.match(panel, /shownPrompt\.value = \{ id: key\.id, token: response\.token \}/, 'a regenerate sets the one secret that is shown')
})

test('the panel has no separate update command: the one prompt covers a re-connect', () => {
  assert.doesNotMatch(panel, /Copy update command/, 'the update button is gone')
  assert.doesNotMatch(panel, /Paste the update command below/, 'the sentence that points to it is gone')
  assert.doesNotMatch(panel, /\{\{ replaceCommand \}\}/, 'the update command is not shown')
  assert.doesNotMatch(panel, /copyReplaceCommand/, 'nothing copies it')
  assert.match(panel, /Set it up yourself/, 'the collapsed section stays')
})

test('the panel names the board scopes as the connect prompt does, with what each allows', () => {
  assert.match(panel, /scope: 'boards:read', label: 'Read boards and tasks', description: 'Boards, tasks, comments and time logs'/)
  assert.match(panel, /scope: 'boards:write', label: 'Change tasks', description: 'Create, edit, move and delete tasks, comment, log time'/)
  assert.match(prompt, /scope: 'boards:read', label: 'Read boards and tasks'/)
  assert.match(prompt, /scope: 'boards:write', label: 'Change tasks'/)
})
