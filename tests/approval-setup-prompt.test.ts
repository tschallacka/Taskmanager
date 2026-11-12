// The setup prompt by browser approval (card mwdd5q94mmq78py1ntp): it carries no token, starts a device request for
// crews:manage on the board, polls, and passes the key only in an environment variable. Pure. Run:
//   node --import tsx --test tests/approval-setup-prompt.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { approvalSetupPrompt } from '../app/utils/approvalSetupPrompt'

const prompt = approvalSetupPrompt({ origin: 'https://tm.example', boardId: 'board-1', boardName: 'Launch board' })

test('the prompt carries no token, no key and no secret', () => {
  assert.doesNotMatch(prompt, /arn_/)
  assert.doesNotMatch(prompt, /Bearer [A-Za-z0-9_-]{8,}/)
  assert.match(prompt, /There is no token in this prompt/)
})

test('it starts a device request for crews:manage on the chosen board, then polls for the key', () => {
  assert.match(prompt, /\/api\/pair\/device"/)
  assert.match(prompt, /\/api\/pair\/device\/poll/)
  assert.match(prompt, /"scopes":\["crews:manage"\]/)
  assert.match(prompt, /"boardId":"board-1"/)
})

test('the key goes only into the environment of the setup command, never into a file or a log', () => {
  assert.match(prompt, /TASKMANAGER_MANAGEMENT_TOKEN="\$KEY" node setup\.mjs/)
  assert.doesNotMatch(prompt, /keys\.env/)
  assert.doesNotMatch(prompt, /CREW_HOME/)
  assert.match(prompt, /Never paste it into a file, a log, a task, a chat or another service/)
})

test('the crew home is ~/crew-<slug>, and the three report lines are the only output the user sees', () => {
  assert.match(prompt, /~\/crew-<slug>/)
  assert.match(prompt, /prints three lines/)
})
