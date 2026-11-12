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

  test('lists the crew endpoints: targets, create, and delete', () => {
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

describe('the management prompt: the one-time keys', () => {
  test('the create answer holds no keys: the keys come from keys_url, in step 3', () => {
    const prompt = managementPrompt(input)
    assert.match(prompt, /The answer holds no keys and no passwords\. They come from the keys route in step 3, once\./)
    assert.match(prompt, /3\. Get the keys: POST the "keys_url" with the same token and no body\./)
  })

  test('the keys are saved to a folder of mode 700 and a file of mode 600, under the user\'s config folder', () => {
    const prompt = managementPrompt(input)
    assert.match(prompt, /The folder is ~\/\.config\/taskmanager\/<slug>\/ \(mode 700\) and the file in it is keys\.env \(mode 600\), outside any repository\./)
    assert.match(prompt, /umask 077; mkdir -p -m 700 ~\/\.config\/taskmanager\/<slug>; curl -s -f -X POST -H "Authorization: Bearer <token>" "<keys_url>" -o ~\/\.config\/taskmanager\/<slug>\/keys\.env/)
  })

  test('the keys are never printed, read back or pasted, and only the path goes to the user', () => {
    const prompt = managementPrompt(input)
    assert.match(prompt, /Never print the file, open it, read it back, or paste a key into a chat, a task, a log or a file of your own\. Tell the user the path, and nothing else about the keys\./)
  })

  test('an existing keys.env is not overwritten: the answer goes to a new name next to it', () => {
    const prompt = managementPrompt(input)
    assert.match(prompt, /If keys\.env already exists, do not overwrite it\. Save the answer to a new name next to it \(keys-2\.env, keys-3\.env, and so on\) and tell the user that name\./)
  })

  test('the file loads into a shell, and the names of its variables are spelled out', () => {
    const prompt = managementPrompt(input)
    assert.match(prompt, /The file loads into a shell with: \. ~\/\.config\/taskmanager\/<slug>\/keys\.env/)
    assert.match(prompt, /TASKMANAGER_CREW_<SLUG>_<PERSON>_API_KEY or TASKMANAGER_CREW_<SLUG>_<PERSON>_PASSWORD, with the slug and the person upper-cased and dashes turned into underscores\./)
  })

  test('each call to keys_url makes new keys, so it is called once', () => {
    const prompt = managementPrompt(input)
    assert.match(prompt, /Every call to keys_url makes new keys, and the old ones stop working at once\. Call it once, and again only when the file was lost\./)
  })

  test('a taken slug answers 409, the agent picks another slug, and never rotates', () => {
    const prompt = managementPrompt(input)
    assert.match(prompt, /Every call makes a new crew\./)
    assert.match(prompt, /If the slug is already taken the call answers 409: choose another slug and send the call again\. Never add "rotate" to this call\./)
    assert.doesNotMatch(prompt, /"rotate": true/)
  })

  test('the crew\'s own board is not the work board: the shadow board is', () => {
    const prompt = managementPrompt(input)
    assert.match(prompt, /The crew's own board, "crew\.boardUrl", is not the work board\. Do not give it to the crew, unless the owner decides otherwise\./)
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
