// The mail routes live outside the crew gate. The gate (server/middleware/crewGate.ts) answers every /api/crews/* path with
// a 404 to a member key from a remote machine, so mail under /api/crews was unreachable (live QA, 0.20.0). This test pins
// the move: the mail URLs are not crew API paths, the other crew paths still are, and no mail route is left under
// /api/crews. Needs no database.
//   node --import tsx --test tests/crew-mail-path.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isCrewApiPath } from '../server/utils/crewGatePolicy'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('the mail URLs are not crew API paths, so the gate does not answer them', () => {
  assert.equal(isCrewApiPath('/api/crew-mail/blaze-taskmanager-maintenance'), false)
  assert.equal(isCrewApiPath('/api/crew-mail/blaze-taskmanager-maintenance?to=pia'), false)
  assert.equal(isCrewApiPath('/api/crew-mail/blaze-taskmanager-maintenance/0123456789abcdef0123456789abcdef/ack'), false)
})

test('the other crew paths are still gated', () => {
  assert.equal(isCrewApiPath('/api/crews'), true)
  assert.equal(isCrewApiPath('/api/crews/blaze-taskmanager-maintenance'), true)
  assert.equal(isCrewApiPath('/api/crews/blaze-taskmanager-maintenance/mail'), true)
})

test('the mail route files are under /api/crew-mail, and none is left under /api/crews', () => {
  for (const file of ['index.post.ts', 'index.get.ts', join('[id]', 'ack.post.ts')]) {
    assert.ok(existsSync(join(root, 'server', 'api', 'crew-mail', '[slug]', file)), `${file} is under crew-mail`)
    assert.equal(existsSync(join(root, 'server', 'api', 'crews', '[slug]', 'mail', file)), false, `${file} is not under crews`)
  }
})
