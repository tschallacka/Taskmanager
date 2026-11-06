// The board menu's items, built the same way wherever a board is opened from. Pure: no DOM, no
// network. Run: node --import tsx --test tests/board-menu.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBoardMenu, type BoardMenuActions } from '../app/utils/boardMenu'

function actions(): BoardMenuActions & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    rename: () => calls.push('rename'),
    notify: () => calls.push('notify'),
    settings: () => calls.push('settings'),
    togglePin: () => calls.push('pin')
  }
}

function labels(groups: ReturnType<typeof buildBoardMenu>) {
  return groups.map(group => group.map(item => item.label))
}

test('a staff board offers rename, notify, settings and pin, in that order', () => {
  const groups = buildBoardMenu({ audience: 'staff', pinned: false, watching: false, actions: actions() })
  assert.deepEqual(labels(groups), [
    ['Rename', 'Notify me of new tasks', 'Settings'],
    ['Pin to sidebar']
  ])
})

test('a pinned, watched board reads as the opposite of each toggle', () => {
  const groups = buildBoardMenu({ audience: null, pinned: true, watching: true, actions: actions() })
  assert.equal(groups[0]![1]!.label, 'Stop notifying me of new tasks')
  assert.equal(groups[1]![0]!.label, 'Unpin')
  assert.equal(groups[1]![0]!.icon, 'i-lucide-pin-off')
})

test('a customer board offers only pinning', () => {
  const groups = buildBoardMenu({
    audience: 'customer',
    pinned: false,
    watching: false,
    actions: actions(),
    extra: [[{ label: 'Delete project', onSelect: () => {} }]]
  })
  assert.deepEqual(labels(groups), [['Pin to sidebar']])
})

test('extra groups for the place come after the common ones', () => {
  const groups = buildBoardMenu({
    audience: 'staff',
    pinned: false,
    watching: false,
    actions: actions(),
    extra: [[{ label: 'Show trashed (2)', onSelect: () => {} }], [{ label: 'Delete project', onSelect: () => {} }]]
  })
  assert.deepEqual(labels(groups), [
    ['Rename', 'Notify me of new tasks', 'Settings'],
    ['Pin to sidebar'],
    ['Show trashed (2)'],
    ['Delete project']
  ])
})

test('each item runs its own action', async () => {
  const a = actions()
  const groups = buildBoardMenu({ audience: 'staff', pinned: false, watching: false, actions: a })
  for (const group of groups) {
    for (const item of group) await item.onSelect?.(new Event('select') as never)
  }
  assert.deepEqual(a.calls, ['rename', 'notify', 'settings', 'pin'])
})
