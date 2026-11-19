// The helpers that no caller uses any more (CQ should 1, Nina on a05ef12): the customer invite route and the Share path
// go through sharePlan, so these have no caller in app/ or server/ and only their own tests used them. Source level.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('fileableProjectIds, takenByOther and takenMessage are gone', () => {
  assert.doesNotMatch(read('shared/utils/inviteEmail.ts'), /fileableProjectIds/)
  assert.doesNotMatch(read('shared/utils/projectFiling.ts'), /takenByOther|takenMessage/)
})
