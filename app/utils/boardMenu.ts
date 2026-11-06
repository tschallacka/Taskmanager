import type { DropdownMenuItem } from '@nuxt/ui'

// The menu of one board, the same wherever it is opened from: the board's own header,
// its "⋯" button and a right-click. Each place adds only what it alone can do.

export interface BoardMenuActions {
  rename: () => void
  notify: () => void
  settings: () => void
  togglePin: () => void
}

export interface BoardMenuState {
  audience?: string | null
  pinned: boolean
  watching: boolean
  actions: BoardMenuActions
  extra?: DropdownMenuItem[][]
}

export function buildBoardMenu(state: BoardMenuState): DropdownMenuItem[][] {
  const pin: DropdownMenuItem[] = [{
    label: state.pinned ? 'Unpin' : 'Pin to sidebar',
    icon: state.pinned ? 'i-lucide-pin-off' : 'i-lucide-pin',
    onSelect: state.actions.togglePin
  }]
  // A customer's board belongs to its organisation: the person may pin it and nothing more.
  if (state.audience === 'customer') return [pin]
  return [
    [
      { label: 'Rename', icon: 'i-lucide-pencil', onSelect: state.actions.rename },
      {
        label: state.watching ? 'Stop notifying me of new tasks' : 'Notify me of new tasks',
        icon: state.watching ? 'i-lucide-bell-off' : 'i-lucide-bell',
        onSelect: state.actions.notify
      },
      { label: 'Settings', icon: 'i-lucide-settings', onSelect: state.actions.settings }
    ],
    pin,
    ...(state.extra ?? [])
  ]
}
