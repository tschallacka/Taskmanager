// The Browse projects page carries the board menu on every board row and on the archived boards.
// The page is a Vue template, so this reads its source and checks the wrapping, the way the
// browser sees it: a row that is not inside a BoardMenu in context mode opens no menu on right-click.
// Run: node --import tsx --test tests/browse-board-menu.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/pages/projects/browse.vue', import.meta.url), 'utf8')
const template = source.slice(source.indexOf('<template>'))

// The text from the nearest BoardMenu opening tag before a marker, up to the marker.
function wrapperBefore(marker: string) {
  const at = template.indexOf(marker)
  assert.ok(at > 0, `${marker} is on the page`)
  const opening = template.lastIndexOf('<BoardMenu', at)
  assert.ok(opening > 0, `${marker} sits inside a BoardMenu`)
  assert.ok(template.indexOf('</BoardMenu>', at) > at, `${marker} is closed inside the BoardMenu`)
  return template.slice(opening, at)
}

test('every board row opens the board menu on right-click', () => {
  const head = wrapperBefore('data-browse-row')
  assert.match(head, /mode="context"/)
  assert.match(head, /:board="project"/)
})

test('an archived board opens the board menu on right-click', () => {
  // The archived block comes after the main list, so its name is the one after its marker.
  const archived = template.indexOf('data-browse-archived')
  assert.ok(archived > 0, 'the archived rows are on the page')
  const name = template.indexOf('{{ project.name }}', archived)
  const head = template.slice(template.lastIndexOf('<BoardMenu', name), name)
  assert.ok(template.lastIndexOf('<BoardMenu', name) > archived, 'the archived name sits inside a BoardMenu')
  assert.match(head, /mode="context"/)
  assert.match(head, /:board="project"/)
})
