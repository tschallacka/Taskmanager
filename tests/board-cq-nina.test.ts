// Nina's two CQ notes on 3/9 rest: the board page uses the shared initials rule, and a members reply for a board the page
// has left is dropped. Read from the page source, as the other board tests do. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json node --import tsx --test tests/board-cq-nina.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../app/pages/projects/[id].vue', import.meta.url), 'utf8')

test('the board page has no local initials helper; the avatars use the shared initialsOf', () => {
  assert.doesNotMatch(page, /const initials = \(name: string\)/)
  assert.match(page, /import \{ initialsOf \} from '~\/utils\/avatarInitials'/)
  assert.match(page, /:text="initialsOf\(person\.name, null\)"/)
})

// The people came from a separate members call before the board answer carried them (speed, step C). The same guard now
// sits in useProjects: a board's answer is written only while that board is still the open one.
const composable = readFileSync(new URL('../app/composables/useProjects.ts', import.meta.url), 'utf8')

test('a board answer is written only while the page is still on that board (reply branch)', () => {
  const at = composable.indexOf('const [board, people] = await Promise.all')
  const block = composable.slice(at, composable.indexOf('_boardLoadError.value = boardLoadStateAfter', at))
  assert.match(block, /if \(_activeProjectId\.value === id\) \{[\s\S]*_boardMembers\.value = board\.members \?\? \[\]/)
})

test('the people are written from the board answer, the board cache or a reload of the same board, and nowhere else', () => {
  assert.equal(composable.match(/_boardMembers\.value = /g)?.length, 3)
  assert.match(composable, /_boardMembers\.value = cached\?\.members \?\? \[\]/)
  assert.match(composable, /_boardMembers\.value = board\.members \?\? \[\]/)
})
