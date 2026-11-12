// The crew's own token's prompts (card mwdd9d2vtgqhfr6izq): one job each, the crew's home ~/crew-<slug>, its own routes
// only, the token once. Pure. Run: node --import tsx --test tests/crew-manage-prompt.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crewManagePrompt } from '../app/utils/crewManagePrompt'

const base = { origin: 'https://tm.example', slug: 'acme', boardName: 'Launch board crew board', token: 'arn_TOKEN_ONCE', expiresAt: Date.UTC(2026, 10, 12, 10) }

test('the recover prompt fetches the keys of this crew only, into ~/crew-<slug>, with mode 600', () => {
  const prompt = crewManagePrompt({ ...base, job: 'recover' })
  assert.match(prompt, /Job: recover the keys/)
  assert.match(prompt, /\/api\/crews\/acme\/keys\?format=json/)
  assert.match(prompt, /~\/crew-acme\/creds\.json/)
  assert.match(prompt, /umask 077/)
  assert.match(prompt, /old keys stop working/)
  assert.doesNotMatch(prompt, /\/people/)
})

test('the add-people prompt calls the people route of this crew and keeps the existing entries', () => {
  const prompt = crewManagePrompt({ ...base, job: 'people' })
  assert.match(prompt, /Job: add the missing people/)
  assert.match(prompt, /\/api\/crews\/acme\/people"/)
  assert.match(prompt, /keeping every existing entry/)
  assert.doesNotMatch(prompt, /\/keys/)
})

test('the token is named once per prompt, never printed twice in one prompt, and no prompt relies on CREW_HOME or keys.env', () => {
  for (const job of ['recover', 'people'] as const) {
    const prompt = crewManagePrompt({ ...base, job })
    assert.equal(prompt.split('arn_TOKEN_ONCE').length - 1, 1)
    assert.doesNotMatch(prompt, /CREW_HOME/)
    assert.doesNotMatch(prompt, /keys\.env/)
  }
})
