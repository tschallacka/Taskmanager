import { realtimeHeaders } from '~/composables/useRealtime'
import { errorMessage, untypedFetch } from '~/utils/untypedFetch'

/**
 * "Notify when tasks are added to the project": whether the signed-in person asked to hear about every
 * new task on a board. Read when asked for and written on a change; the server decides what they may
 * read, so a guest is told only of the tasks that are not private.
 */
export function useBoardWatch(projectId: () => string) {
  const watching = ref(false)
  const saving = ref(false)
  const toast = useToast()

  async function load() {
    try {
      watching.value = (await untypedFetch<{ watching: boolean }>(`/api/projects/${projectId()}/watch`)).watching
    } catch {
      watching.value = false
    }
  }

  async function set(value: boolean) {
    saving.value = true
    const before = watching.value
    watching.value = value
    try {
      await untypedFetch(`/api/projects/${projectId()}/watch`, { method: 'PUT', headers: realtimeHeaders(), body: { watching: value } })
      toast.add({
        title: value ? 'You will be notified of new tasks' : 'No more notifications for new tasks',
        icon: value ? 'i-lucide-bell-ring' : 'i-lucide-bell-off',
        duration: 2000
      })
    } catch (e) {
      watching.value = before
      toast.add({ title: errorMessage(e, 'Could not change that'), icon: 'i-lucide-alert-triangle', color: 'error' })
    } finally {
      saving.value = false
    }
  }

  return { watching, saving, load, set }
}
