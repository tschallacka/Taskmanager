import type { DropdownMenuItem } from '@nuxt/ui'
import type { Project } from '~/composables/useProjects'
import { buildBoardMenu } from '~/utils/boardMenu'

export interface BoardMenuBoard {
  id: string
  name: string
  audience?: Project['audience']
}

export interface BoardMenuOptions {
  // Starts the rename where the board is shown. Without it, Rename opens the board with ?rename=1.
  rename?: (board: BoardMenuBoard) => void
  // Items after the common ones, for what only this place can do (delete, trash, a crew).
  extra?: (board: BoardMenuBoard) => DropdownMenuItem[][]
}

// The state of one board's menu. Notify and pin are read when the menu is first opened (prepare),
// so a list of boards costs nothing until someone asks for a menu.
export function useBoardMenu(board: () => BoardMenuBoard, options: () => BoardMenuOptions = () => ({})) {
  const notify = useBoardWatch(() => board().id)
  const { isPinned, pinBoard, unpinBoard, loadPins, pinsLoaded } = usePins()
  const toast = useToast()

  function prepare() {
    notify.load()
    if (!pinsLoaded.value) loadPins().catch(() => {})
  }

  async function togglePin() {
    const id = board().id
    try {
      await (isPinned(id) ? unpinBoard(id) : pinBoard(id))
    } catch {
      toast.add({ title: 'Could not change the pin', color: 'error' })
    }
  }

  function rename() {
    const current = board()
    const start = options().rename
    if (start) start(current)
    else navigateTo({ path: `/projects/${current.id}`, query: { rename: '1' } })
  }

  const items = computed<DropdownMenuItem[][]>(() => {
    const current = board()
    return buildBoardMenu({
      audience: current.audience,
      pinned: isPinned(current.id),
      watching: notify.watching.value,
      actions: {
        rename,
        notify: () => notify.set(!notify.watching.value),
        settings: () => navigateTo({ path: `/projects/${current.id}`, query: { view: 'settings' } }),
        togglePin
      },
      extra: options().extra?.(current)
    })
  })

  return { items, prepare }
}
