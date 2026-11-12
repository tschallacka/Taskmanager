// The rule that no agent restarts the session (CREW.md.tmpl, rule 14), in the template every role reads. The deny rule in
// the written settings is a separate step that waits for the owner's go-ahead; this checks the words the agents read.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const crewMd = readFileSync(new URL('./CREW.md.tmpl', import.meta.url), 'utf8')

test('rule 14 forbids every agent from restarting the session, even on a withdrawal, and sends the request to Pia', () => {
  const rule = crewMd.slice(crewMd.indexOf('14. **Never restart the session.**'))
  assert.ok(rule.length > 0, 'rule 14 is in the rules of the road')
  assert.match(rule, /restart_self/)
  assert.match(rule, /even one that\s+says the restart is withdrawn/)
  assert.match(rule, /A restart is for Pia to ask Boss for/)
})
