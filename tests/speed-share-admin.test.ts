// Speed, Nina's SHOULD 2 (card mwibpggp): an admin must still see the waiting-approval count on the Share button when the board opens.
// The board answer says whether the viewer is an admin of the board (shareAdmin: the same rule the guest listing applies, vault role
// manager), with no extra call. BoardShare loads the listing when the board opens only for an admin; a guest or a member makes no
// call for it. The dialog still loads the listing on open, as before. Source-level.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('the board answer says whether the viewer is an admin of the board, from the same vault role the listing uses', () => {
  const board = read('server/api/projects/[id]/board.get.ts')
  assert.match(board, /const viewerRole = isCustomer \? null : await vaultRoleOf\(project, viewerId\)/, 'the role is read once')
  assert.match(board, /shareAdmin: viewerRole === 'manager'/, 'the answer carries the admin flag')
  assert.equal((board.match(/vaultRoleOf\(/g) ?? []).length, 1, 'one call for the role, read once and used twice')
  assert.match(board, /managesBoard: viewerRole === 'manager'/, 'the members masking reuses the same role')
  const guests = read('server/utils/guestInvites.ts')
  assert.match(guests, /if \(await vaultRoleOf\(project, userId\) === 'manager'\) return \{ kind: 'admin' \}/, 'the listing rule is the one the flag mirrors')
})

test('BoardShare loads the listing on board open for an admin only, and the dialog still loads it on open', () => {
  const share = read('app/components/BoardShare.vue')
  assert.match(share, /const adminOnThisBoard = computed\(\(\) => activeProjectId\.value === props\.projectId && shareAdmin\.value\)/)
  const store = read('app/composables/useProjects.ts')
  assert.match(store, /_shareAdmin\.value = board\.shareAdmin \?\? false/, 'the store takes the flag from the board answer')
  assert.match(store, /shareAdmin: _shareAdmin,/, 'the store exposes the flag')
  assert.match(share, /const \{ activeProjectId, shareAdmin \} = useProjects\(\)/)
  assert.match(share, /watch\(adminOnThisBoard, \(isAdmin\) => \{\s*if \(isAdmin\) loadListing\(\)\s*\}, \{ immediate: true \}\)/)
  const start = share.indexOf('watch(() => props.projectId, () => {')
  const projectWatch = share.slice(start, share.indexOf('}, { immediate: true })', start))
  assert.doesNotMatch(projectWatch, /loadListing\(\)/, 'a guest or a member makes no listing call when the board opens')
  assert.match(share, /watch\(open, \(isOpen\) => \{\s*if \(isOpen\) \{\s*loadListing\(\)/, 'the dialog still loads the listing on open')
})
