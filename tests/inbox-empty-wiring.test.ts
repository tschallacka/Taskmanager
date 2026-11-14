// The inbox page's Empty and Archive controls are wired to the composable: every function the page calls from
// useNotifications is taken from it, the Empty buttons call askEmpty, and the confirm button calls confirmEmpty. A missing
// name from the destructure made the Empty buttons throw in the browser (inbox.vue called emptyReadBox, which was not
// taken from the composable). This reads the source; a real click needs the Nuxt runtime and a browser, which the light
// suite does not run.
//   node --import tsx --test tests/inbox-empty-wiring.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const page = readFileSync(join(root, 'app/pages/projects/inbox.vue'), 'utf8')
const composable = readFileSync(join(root, 'app/composables/useNotifications.ts'), 'utf8')

/** The names the page takes from useNotifications(). */
function takenFromComposable(source: string): string[] {
  const match = source.match(/const \{([^}]*)\} = useNotifications\(\)/)
  assert.ok(match, 'the page takes its functions from useNotifications()')
  return match[1].split(',').map(name => name.trim()).filter(Boolean)
}

test('every composable function the Archive and Empty code calls is taken from useNotifications()', () => {
  const taken = takenFromComposable(page)
  for (const name of ['archive', 'archiveAll', 'unarchive', 'loadReadBox', 'emptyReadBox']) {
    assert.ok(taken.includes(name), `${name} is called on the page but not taken from useNotifications()`)
  }
})

test('the composable returns emptyReadBox, so the page can take it', () => {
  assert.match(composable, /return \{[^}]*\bemptyReadBox\b[^}]*\}/)
})

test('the Empty buttons open the count, and the confirm button deletes', () => {
  assert.match(page, /@click="askEmpty\(choice\)"/)
  assert.match(page, /data-empty-confirm-button[\s\S]*?@click="confirmEmpty"/)
})
