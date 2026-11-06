import { taskAddress } from '#shared/utils/taskAddress'

// Copy link: the absolute address of a task, the one the address bar shows once the task is open. The
// cards, the task panel and its subtasks all copy through here, so they agree with the address bar.
export function useTaskLink() {
  const toast = useToast()

  function linkOf(boardId: string, taskId: string): string {
    return `${window.location.origin}${taskAddress(boardId, taskId)}`
  }

  async function copyLink(boardId: string, taskId: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(linkOf(boardId, taskId))
      toast.add({ title: 'Link copied', icon: 'i-lucide-link', duration: 2000 })
    } catch {
      // Some browsers refuse the clipboard outside a secure page or without a gesture.
      toast.add({ title: 'Could not copy the link', description: 'Copy the address bar instead.', icon: 'i-lucide-alert-triangle', color: 'error' })
    }
  }

  return { linkOf, copyLink }
}
