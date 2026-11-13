// The copy-paste prompt of "Put an AI crew to work on this board", the countdown, and the link a crew refusal points to. Pure, no
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

describe('the management prompt: one new crew, in three steps', () => {
  test('names the base URL, the board id and the board name', () => {
    const prompt = managementPrompt(input)
    assert.match(prompt, /one Taskmanager board\. The board is "Launch board" \(board id board-abc\) at https:\/\/taskmanager\.example\./)
    assert.match(prompt, /--board board-abc/)
    assert.match(prompt, /--origin https:\/\/taskmanager\.example/)
  })

  test('says the token dies in 10 minutes, with the exact expiry time, and works for this board only', () => {
    const prompt = managementPrompt(input)
    assert.match(prompt, /Your management token works for 10 minutes, until 2026-11-07T22:40:00\.000Z, and then it stops\. It works for this board only\./)
  })

  test('has the three steps, in order: the kit, the setup command, the report', () => {
    const prompt = managementPrompt(input)
    const one = prompt.indexOf('Step 1: get the kit')
    const two = prompt.indexOf('Step 2: make the crew')
    const three = prompt.indexOf('Step 3: report')
    assert.ok(one > 0 && two > one && three > two, 'the steps are in order')
  })

  test('downloads the kit from this instance, into a folder of its own', () => {
    const prompt = managementPrompt(input)
    assert.match(prompt, /curl -sSf -D - -o ~\/crew-kit\.tar\.gz https:\/\/taskmanager\.example\/crew\/kit\.tar\.gz/)
    assert.match(prompt, /~\/crew-kit-<host>/)
  })

  test('runs the setup with the token in the environment variable, and nowhere on the command line', () => {
    const prompt = managementPrompt(input)
    assert.match(prompt, /TASKMANAGER_MANAGEMENT_TOKEN=<token> node setup\.mjs --origin https:\/\/taskmanager\.example --board board-abc --repo <repository path>/)
    assert.doesNotMatch(prompt, /--token/)
  })

  test('the token appears once: on its own line, shown once', () => {
    const prompt = managementPrompt(input)
    assert.equal(prompt.split(TOKEN).length - 1, 1, 'the token is shown once, and never repeated')
  })

  test('a crew is always new: a taken slug is never rotated', () => {
    const prompt = managementPrompt(input)
    assert.match(prompt, /The crew is always new\. If the command says the slug is taken, run it again with --slug <another slug>\. Never rotate a crew\./)
    assert.doesNotMatch(prompt, /"rotate": true/)
  })

  test('the report is the three lines the command prints, and no key or file of the crew home is opened', () => {
    const prompt = managementPrompt(input)
    assert.match(prompt, /The command prints three lines: the crew home, the work board's address, and what to do next\./)
    assert.match(prompt, /Do not open or print any file in the crew home, and print no key or password\./)
  })

  test('the keys route and the keys.env file are gone from the prompt', () => {
    const prompt = managementPrompt(input)
    assert.doesNotMatch(prompt, /keys\.env/)
    assert.doesNotMatch(prompt, /keys_url/)
    assert.doesNotMatch(prompt, /~\/\.config\/taskmanager/)
  })

  test('states the rules: the work board only, no writes to the real board, a management token and not a crews:manage key', () => {
    const prompt = managementPrompt(input)
    assert.match(prompt, /A crew works only on its work board, the shadow board the command names\. Never write to the real board, board-abc\./)
    assert.match(prompt, /A remote call to the crew API needs this management token\. A crews:manage key does not work here\./)
    assert.match(prompt, /A management token reaches only this board\. Any other board or crew is refused or answers 404\./)
  })

  test('stops on 401 with the token message word for word, and on 403 with the sentence', () => {
    const prompt = managementPrompt(input)
    assert.match(prompt, /If a call answers 401 with the code token_expired, token_regenerated or token_revoked, stop\. Do not retry with this token\./)
    assert.match(prompt, /Tell the user the message the reply gave, word for word/)
    assert.match(prompt, /If a call answers 403, tell the user the sentence in the reply, word for word, and stop\./)
  })

  test('asks the user one question at most: the repository path', () => {
    const prompt = managementPrompt(input)
    assert.match(prompt, /Ask the user one question only: the path of the repository the crew works on, if you do not know it\./)
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
