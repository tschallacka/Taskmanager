// Speed, step C: a board visit makes one board call and the picker call, not five. The top bar's people and the "notify me"
// flag come with the board answer, and the share dialog's guest list is fetched when the dialog opens, not on every board.
// Source level: it reads the files, so it fails on the old load path.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('the board answer carries the top bar people and the notify flag', () => {
  const board = read('server/api/projects/[id]/board.get.ts')
  assert.match(board, /import \{ isWatching \} from '\.\.\/\.\.\/\.\.\/utils\/projectWatchers'/)
  assert.match(board, /import \{ listProjectPeople, vaultRoleOf \} from '\.\.\/\.\.\/\.\.\/utils\/projectMembers'/)
  assert.match(board, /watching: isCustomer \? false : await isWatching\(id, viewerId\)/)
  // The members route serves staff only (routeMembers: audience must be 'staff'); the board must not widen that.
  assert.match(board, /const members = project\.audience === 'staff'\n\s+\? await maskEmails\(/, 'the members are for staff only, masked the way the members route masks them')
  assert.match(board, /\n\s+members,\n/, 'the answer carries them')
})

test('opening a board does not call /members or /watch on its own', () => {
  const page = read('app/pages/projects/[id].vue')
  assert.doesNotMatch(page, /loadBoardPeople\(id\)/, 'the top bar people come with the board answer')
  assert.doesNotMatch(page, /boardWatch\.load\(\)/, 'the notify flag comes with the board answer')
  // The board answer reaches the page through useProjects (boardMembers, boardWatching), set by the same board fetch.
  assert.match(page, /const \{ refresh: refreshProjects, boardMembers, boardWatching \} = useProjects\(\)/)
  assert.match(page, /const boardPeople = computed\(\(\) => isCustomerView\.value \? \[\] : boardMembers\.value\)/)
  assert.match(page, /watch\(boardWatching, \(value\) => \{\n\s+boardWatch\.watching\.value = value/)
  const composable = read('app/composables/useProjects.ts')
  assert.match(composable, /_boardMembers\.value = board\.members \?\? \[\]/, 'the board fetch sets the people')
  assert.match(composable, /_boardWatching\.value = board\.watching \?\? false/, 'the board fetch sets the notify flag')
})

test('the share dialog loads the guest list when it opens, not when the board opens', () => {
  const share = read('app/components/BoardShare.vue')
  const start = share.indexOf('watch(() => props.projectId')
  assert.ok(start > 0, 'the project watcher is there')
  const end = share.indexOf('{ immediate: true })', start)
  const watcher = share.slice(start, end)
  assert.doesNotMatch(watcher, /loadListing\(\)/, 'the project watcher does not fetch the guest list on mount')
  assert.match(share, /watch\(open, \(isOpen\) => \{\n\s*if \(isOpen\) \{\n\s*loadListing\(\)/, 'opening the dialog still loads it')
})
