// Regenerate key: the one-time result is attached to the key's own row (ConnectTokens.vue), and the page's top banner
// (connect.vue) is for a new connection only, so regenerating leaves it untouched. Checked at source level, as the
// other connect and shell tests are.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const tokens = readFileSync(new URL('../app/components/connect/ConnectTokens.vue', import.meta.url), 'utf8')
const page = readFileSync(new URL('../app/pages/connect.vue', import.meta.url), 'utf8')

test('regenerate sets the result on that key, not on the page: no issued event for a regenerated key', () => {
  const regenerate = tokens.slice(tokens.indexOf('async function regenerate('), tokens.indexOf('// ─── Revoke'))
  assert.match(regenerate, /issuedRow\.value = \{ tokenId: token\.id, connection: \{/, 'the result is kept with the key id')
  assert.doesNotMatch(regenerate, /emit\('issued'/, 'the page banner is not used for a regenerated key')
})

test('the result is drawn inside the clicked key\'s row, under its buttons, with a dismiss', () => {
  assert.match(tokens, /:id="`connect-row-\$\{token\.id\}`"/, 'each row has its own id to scroll to')
  assert.match(tokens, /<ConnectResult\s+v-if="issuedRow && issuedRow\.tokenId === token\.id"/, 'the result shows only in the row it belongs to')
  assert.match(tokens, /@dismiss="issuedRow = null"/)
  assert.ok(tokens.indexOf('<ConnectResult') > tokens.indexOf('label="Revoke"'), 'the result sits after the row buttons')
})

test('the row scrolls into view after a regenerate', () => {
  assert.match(tokens, /nextTick\(\(\) => document\.getElementById\(`connect-row-\$\{token\.id\}`\)\?\.scrollIntoView\(/)
})

test('the page banner is still set by a new connection only', () => {
  assert.match(page, /<ConnectResult\s+v-if="issued"/, 'the banner is the page\'s own result')
  assert.match(page, /<ConnectNewToken[\s\S]*?@issued="onIssued"/, 'a new connection sets it')
  const onIssuedSource = page.slice(page.indexOf('function onIssued('), page.indexOf('function onIssued(') + 120)
  assert.match(onIssuedSource, /issued\.value = connection/)
})

test('Edit boards and Add a board confirm in their own row, not in a toast elsewhere', () => {
  const saveEdit = tokens.slice(tokens.indexOf('async function saveEdit('), tokens.indexOf('function boardsNamed('))
  const submitAdd = tokens.slice(tokens.indexOf('async function submitAdd('), tokens.indexOf('function toggleAddScope('))
  assert.match(saveEdit, /noteRow\(token\.id, 'Connection saved/, 'the save confirms in the row')
  assert.doesNotMatch(saveEdit, /toast\.add\(\{ title: 'Connection saved'/, 'no success toast for the save')
  assert.match(submitAdd, /noteRow\(token\.id, `Added /, 'the add confirms in the row')
  assert.doesNotMatch(submitAdd, /toast\.add\(\{ title: `Added /, 'no success toast for the add')
  assert.match(tokens, /data-connect-row-note/, 'the row shows the confirmation')
})

test('the row confirmation scrolls its row into view', () => {
  assert.match(tokens, /function noteRow\([\s\S]*?scrollIntoView/)
})
