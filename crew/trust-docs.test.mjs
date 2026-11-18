// The docs say the kit manages the trust of the crew's own folders (card mwk8koh1xf1jikjrkff, step 6): the taskmanager-crew skill and
// crew/README.md each carry one short paragraph that says so, and that nobody is asked to accept a prompt for them. Read as text.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const KIT = dirname(fileURLToPath(import.meta.url))

for (const file of ['SKILL.md', 'README.md']) {
  test(`${file} says the kit manages the trust of the crew's own folders, and that nobody is asked to accept a prompt`, () => {
    const text = readFileSync(join(KIT, file), 'utf8')
    assert.match(text, /trust/i, 'the trust is mentioned')
    assert.match(text, /crew update/, 'crew update trusts them')
    assert.match(text, /crew's own folders|crew's own folder/, 'the crew\'s own folders are named')
    assert.match(text, /nobody is asked to accept|no one is asked to accept|nobody has to accept|no one has to accept/i, 'nobody is asked to accept a prompt')
  })
}
