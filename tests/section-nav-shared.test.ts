// Nina's CQ on 8/9 (verdict at 47d5aa1): CQ 1 (must) three copies of the same left-list nav (account, project settings,
// admin). One component draws the items, and each shell keeps only its own wrapper. CQ 2 (should): two comments in
// projectSettingsSections.ts said Customer access, Import, Trash and Archive had no panel yet; they all have one now. Source
// level. Run:
//   node --import tsx --test tests/section-nav-shared.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../app/', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')

test('one shared component draws the section items, marks the current one, and is a ghost button list', () => {
  assert.ok(existsSync(new URL('components/SectionNav.vue', root)), 'SectionNav.vue exists')
  const nav = read('components/SectionNav.vue')
  assert.match(nav, /v-for="item in items"/)
  assert.match(nav, /variant="ghost"/)
  assert.match(nav, /aria-current/)
})

for (const shell of ['components/settings/Shell.vue', 'components/settings/ProjectShell.vue', 'components/admin/Shell.vue']) {
  test(`${shell} uses the shared item component and keeps no loop of its own`, () => {
    const source = read(shell)
    assert.match(source, /<SectionNav\b/)
    assert.equal(/v-for="s in (sections|ADMIN_SECTIONS|builtProjectSections)/.test(source), false, 'no own v-for over the sections')
  })
}

test('the project section table says Customer access, Import, Trash and Archive have panels, and no comment says otherwise', () => {
  const table = read('utils/projectSettingsSections.ts')
  assert.equal(table.includes('get theirs in later steps'), false, 'stale comment above PROJECT_PANEL_COMPONENTS')
  assert.equal(table.includes('listed once they have a panel (later steps)'), false, 'stale comment above BUILT_KEYS')
})
