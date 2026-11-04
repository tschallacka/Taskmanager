<script setup lang="ts">
import { realtimeHeaders } from '~/composables/useRealtime'
import { errorMessage, untypedFetch } from '~/utils/untypedFetch'

// "Draft task": a small window that files a task for one person on one of the boards you share with
// them. The task lands in the board's first column, assigned to them.
const props = defineProps<{
  person: { id: string, name: string, image: string | null }
  /** The boards you share with them where you work as staff, so may file work. */
  boards: { id: string, name: string }[]
}>()
const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const { activeProject } = useProjects()
const title = ref('')
const description = ref('')
const projectId = ref('')
const saving = ref(false)
const error = ref('')

// The board you have open when it is one of the shared ones, else the first.
watch(open, (isOpen) => {
  if (!isOpen) return
  error.value = ''
  const current = activeProject.value?.id
  projectId.value = props.boards.some(board => board.id === current) ? current! : (props.boards[0]?.id ?? '')
})

async function create() {
  if (!projectId.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    const board = await untypedFetch<{ columns: { id: string }[] }>(`/api/projects/${projectId.value}/board`)
    const column = board.columns[0]
    if (!column) throw new Error('That board has no column to put the task in')
    const task = await untypedFetch<{ id: string }>(`/api/projects/${projectId.value}/tasks`, {
      method: 'POST',
      headers: realtimeHeaders(),
      body: { columnId: column.id, title: title.value.trim() || 'Untitled', description: description.value, assigneeId: props.person.id }
    })
    toast.add({
      title: `Task given to ${props.person.name}`,
      icon: 'i-lucide-circle-check',
      actions: [{ label: 'Open', onClick: () => { navigateTo(`/projects/${projectId.value}?task=${task.id}`) } }]
    })
    title.value = ''
    description.value = ''
    open.value = false
  } catch (e) {
    error.value = errorMessage(e, 'Could not create the task')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Draft task"
    description="Give someone a task."
    :ui="{ content: 'max-w-lg' }"
  >
    <template #body>
      <form
        class="space-y-3"
        data-draft-task
        @submit.prevent="create"
      >
        <UInput
          v-model="title"
          placeholder="Task name"
          size="lg"
          class="w-full"
          autofocus
          data-draft-title
        />
        <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>For</span>
          <span class="inline-flex items-center gap-1.5 rounded-md bg-elevated px-2 py-1 text-default">
            <UAvatar
              :src="person.image ?? undefined"
              :alt="person.name"
              size="3xs"
            />
            {{ person.name }}
          </span>
          <span>in</span>
          <select
            v-model="projectId"
            class="min-w-0 max-w-56 rounded-md border border-dashed border-default bg-transparent px-2 py-1 text-sm text-default outline-none focus:border-primary"
            aria-label="Project"
            data-draft-project
          >
            <option
              v-for="board in boards"
              :key="board.id"
              :value="board.id"
            >
              {{ board.name }}
            </option>
          </select>
        </div>
        <UTextarea
          v-model="description"
          placeholder="Description"
          :rows="5"
          class="w-full"
        />
        <p
          v-if="error"
          class="text-xs text-error"
        >
          {{ error }}
        </p>
        <div class="flex justify-end">
          <UButton
            type="submit"
            label="Create task"
            :loading="saving"
            :disabled="!title.trim() || !projectId"
            data-draft-create
          />
        </div>
      </form>
    </template>
  </UModal>
</template>
