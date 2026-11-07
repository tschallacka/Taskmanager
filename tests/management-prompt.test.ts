// The copy-paste prompt of "Get AI management token", the countdown, and the link a crew refusal points to. Pure, no
// database. Run:
//   DATABASE_URL=postgresql://arnotes:arnotes@localhost:5432/arnotes_test node --import tsx --test tests/management-prompt.test.ts
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BOARD_CREW_SENTENCE,
  TEAM_CREW_SENTENCE,
  countdownText,
  managementPrompt,
  refusalLink
} from '../app/utils/managementPrompt'

const TOKEN = 'arn_mgmt_test_token_123'
const EXPIRES_AT = Date.UTC(2026, 10, 7, 22, 40, 0)
const input = {
  origin: 'https://taskmanager.example',
  boardId: 'board-abc',
  boardName: 'Launch board',
  token: TOKEN,
  expiresAt: EXPIRES_AT
}

describe('the management prompt', () => {
  test('names the base URL, the board id and the board name', () => {
    const prompt = managementPrompt(input)
    assert.match(prompt, /"Launch board" \(board id board-abc\) at https:\/\/taskmanager\.example\./)
    assert.match(prompt, /"projectId": "board-abc"/)
    assert.match(prompt, /"board_id": "board-abc"/)
  })

  test('says the token dies in 10 minutes, with the exact expiry time', () => {
    const prompt = managementPrompt(input)
    assert.match(prompt, /It works for 10 minutes, until 2026-11-07T22:40:00\.000Z, and then it stops\./)
  })

  test('lists the crew endpoints: targets, create or rotate, and delete', () => {
    const prompt = managementPrompt(input)
    assert.match(prompt, /GET https:\/\/taskmanager\.example\/api\/crews\/targets/)
    assert.match(prompt, /POST https:\/\/taskmanager\.example\/api\/crews$/m)
    assert.match(prompt, /DELETE https:\/\/taskmanager\.example\/api\/crews\/<slug>/)
  })

  test('describes the response, with the shadow board as the work board', () => {
    const prompt = managementPrompt(input)
    assert.match(prompt, /"shadow_board": the crew's work board\. Give the crew this board's "url"/)
    assert.match(prompt, /"real_board": the board of the people\. Do not write to it\./)
    assert.match(prompt, /"userboard": the real board with its shadow boards\./)
  })

  test('states the rules: shadow board only, no writes to the real board, the header only, stop on 401', () => {
    const prompt = managementPrompt(input)
    assert.match(prompt, /A crew works only on its shadow_board\. Never write to the real board/)
    assert.match(prompt, /Never paste the token anywhere except the Authorization header\./)
    assert.match(prompt, /If a call answers 401 with the code token_expired, token_regenerated or token_revoked, stop\. Do not retry with this token\./)
    assert.match(prompt, /Tell your main agent the message the reply gave, word for word/)
  })

  test('carries the token in the Authorization header line, and nowhere else but its own line', () => {
    const prompt = managementPrompt(input)
    assert.match(prompt, new RegExp(`Authorization: Bearer ${TOKEN}`))
    assert.equal(prompt.split(TOKEN).length - 1, 2, 'the token appears on its own line and in the header line, only')
  })

  test('a call that names another board or crew is refused, and the prompt says so', () => {
    const prompt = managementPrompt(input)
    assert.match(prompt, /Any other board or crew is refused or answers 404\./)
  })
})

describe('the countdown', () => {
  test('reads as minutes and seconds, rounding up, and stops at 0:00', () => {
    assert.equal(countdownText(10 * 60_000), '10:00')
    assert.equal(countdownText(599_001), '10:00')
    assert.equal(countdownText(61_000), '1:01')
    assert.equal(countdownText(59_000), '0:59')
    assert.equal(countdownText(1), '0:01')
    assert.equal(countdownText(0), '0:00')
    assert.equal(countdownText(-5_000), '0:00')
  })
})

describe('the link for a crew refusal', () => {
  test('a team refusal links to the crew switch of the team settings', () => {
    assert.deepEqual(refusalLink(TEAM_CREW_SENTENCE, 'board-abc'), {
      label: 'Open the team\'s crew settings',
      to: '/team?section=crews'
    })
  })

  test('a board refusal links to the settings of this board', () => {
    assert.deepEqual(refusalLink(BOARD_CREW_SENTENCE, 'board-abc'), {
      label: 'Open the board\'s settings',
      to: '/projects/board-abc?view=settings'
    })
  })

  test('the instance sentence and any other message have no link', () => {
    assert.equal(refusalLink('Your admin has not allowed crews on this instance.', 'board-abc'), null)
    assert.equal(refusalLink('You do not have permission to do this', 'board-abc'), null)
  })
})
