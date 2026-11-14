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

test('a members reply is written only while the page is still on that board (reply branch)', () => {
  const start = page.indexOf('async function loadBoardPeople(id: string)')
  const body = page.slice(start, page.indexOf('\n}\n', start))
  assert.match(body, /if \(projectId\.value === id\) boardPeople\.value = res\.people \?\? \[\]/)
})

test('a members error is written only while the page is still on that board (catch branch)', () => {
  const start = page.indexOf('async function loadBoardPeople(id: string)')
  const body = page.slice(start, page.indexOf('\n}\n', start))
  assert.match(body, /catch \{\n {4}if \(projectId\.value === id\) boardPeople\.value = \[\]/)
})
