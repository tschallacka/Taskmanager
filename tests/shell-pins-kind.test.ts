// The pinned rail, the kind icon and health tint, the open count, and the Sprocket first-open copy.
// The kind and tint rules are pure functions and are tested directly; the components are checked at source level,
// as the sidebar shell tests are.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { countOpenTasks, healthTint, kindIcon, projectKind } from '../app/utils/projectKind'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('a board is a crew board, a crew home, a customer board or an ordinary board, and each has its icon', () => {
  assert.equal(projectKind({ role: 'shadow' }), 'crew_board')
  assert.equal(projectKind({ role: 'crew_home' }), 'crew_home')
  assert.equal(projectKind({ role: 'real', customerId: 'c1' }), 'customer_board')
  assert.equal(projectKind({ role: 'real', customerId: null }), 'board')
  assert.equal(kindIcon({ role: 'shadow' }), 'i-lucide-users-round')
  assert.equal(kindIcon({ role: 'crew_home' }), 'i-lucide-house')
  assert.equal(kindIcon({ customerId: 'c1' }), 'i-lucide-building-2')
  assert.equal(kindIcon({}), 'i-lucide-kanban')
})

test('the tint follows the board health, and the active board is primary whatever its health', () => {
  assert.equal(healthTint({ status: 'on_track' }), 'text-success')
  assert.equal(healthTint({ status: 'at_risk' }), 'text-warning')
  assert.equal(healthTint({ status: 'off_track' }), 'text-error')
  assert.equal(healthTint({ status: null }), 'text-dimmed')
  assert.equal(healthTint({}), 'text-dimmed')
  assert.equal(healthTint({ status: 'off_track' }, true), 'text-primary', 'the active board is one colour only')
})

test('the open count is the tasks not in a finishing column, and the total is all of them', () => {
  const tasks = [
    { projectId: 'p1', columnId: 'todo' },
    { projectId: 'p1', columnId: 'done' },
    { projectId: 'p1', columnId: 'todo' },
    { projectId: 'p2', columnId: 'done' }
  ]
  const counts = countOpenTasks(tasks, new Map([['p1', new Set(['done'])], ['p2', new Set(['done'])]]))
  assert.deepEqual(counts.get('p1'), { open: 2, total: 3 })
  assert.deepEqual(counts.get('p2'), { open: 0, total: 1 })
  const noFinish = countOpenTasks([{ projectId: 'p3', columnId: 'x' }], new Map())
  assert.deepEqual(noFinish.get('p3'), { open: 1, total: 1 }, 'a board with no finishing column counts every task open')
})

test('the rail and the project list take the kind and the tint from the shared module, with no copy of the rules', () => {
  const sidebar = read('app/components/AppSidebar.vue')
  const list = read('app/components/ProjectsListPanel.vue')
  for (const source of [sidebar, list]) {
    assert.match(source, /from '~\/utils\/projectKind'/)
    assert.doesNotMatch(source, /on_track:\s*'text-success'/, 'the health map lives in projectKind.ts only')
    assert.doesNotMatch(source, /i-lucide-building-2|crew_home' \? 'i-lucide-house'/, 'the kind icons live in projectKind.ts only')
  }
})

test('a pinned rail icon is one text colour: the active one takes the primary tint and no second colour class', () => {
  const sidebar = read('app/components/AppSidebar.vue')
  assert.match(sidebar, /data-rail-project="/, 'the rail marks each pin')
  assert.match(sidebar, /:ui="\{ leadingIcon: item\.tint \}"/, 'the tint is the one colour on the icon')
  assert.doesNotMatch(sidebar, /'bg-elevated text-primary'/, 'the active pin no longer adds a second text colour')
  assert.match(sidebar, /:aria-current="item\.active/)
})

test('the Sprocket first-open copy shows until the panel has been closed once, then the short line', () => {
  const widget = read('app/components/AiChatWidget.vue')
  assert.match(widget, /const firstOpen = computed\(\(\) => !setupSeen\.value\)/, 'reactive, not latched at mount')
  assert.match(widget, /watch\(open, \(isOpen\) => \{\s*if \(!isOpen\) setupSeen\.value = true/, 'the first close marks it seen')
  assert.doesNotMatch(widget, /const firstOpen = ref\(/)
  assert.match(widget, /I need an OpenRouter API key, or Claude Code to answer\. Set it once in Sprocket settings\./)
  assert.match(widget, /No OpenRouter API key yet\. Add one, or let Claude Code answer\./)
})

test('the pin cap is checked under a per-person lock, so two pins at once cannot both pass it', () => {
  const pins = read('server/utils/boardPins.ts')
  assert.match(pins, /db\.transaction\(/)
  assert.match(pins, /pg_advisory_xact_lock\(hashtext/)
})
