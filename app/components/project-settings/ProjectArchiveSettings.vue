<script setup lang="ts">
// The Archive section of the project settings (redesign 8/9): archive or unarchive the project, and delete it. These are
// the danger actions, so they sit last, in one box. Moved out of General; what they do is unchanged.
const props = defineProps<{ projectId: string }>()

const { activeProject, archiveProject, unarchiveProject, deleteProject, board } = useProjects()

const error = ref('')

// The server's message when it sent one, else the fallback. Same rule as the other project settings panels.
function messageOf(e: unknown, fallback: string) {
  const data = (e as { data?: { message?: unknown } })?.data
  return typeof data?.message === 'string' ? data.message : fallback
}

// ─── Archive ───────────────────────────────────────────────

const archiving = ref(false)

async function toggleArchive() {
  const project = activeProject.value
  if (!project) return
  error.value = ''
  archiving.value = true
  try {
    if (project.archivedAt) await unarchiveProject(props.projectId)
    else await archiveProject(props.projectId)
  } catch (e) {
    error.value = messageOf(e, 'Could not change the archive state')
  } finally {
    archiving.value = false
  }
}

// ─── Delete ────────────────────────────────────────────────

const deleteOpen = ref(false)
const deleteConfirm = ref('')
const taskTotal = computed(() => board.value?.tasks.length ?? 0)
// Permanent only once the name is typed exactly as it is.
const canDelete = computed(() => !!activeProject.value && deleteConfirm.value === activeProject.value.name)

function openDelete() {
  deleteConfirm.value = ''
  deleteOpen.value = true
}

async function confirmDelete() {
  if (!canDelete.value) return
  deleteOpen.value = false
  try {
    await deleteProject(props.projectId)
    navigateTo('/projects')
  } catch (e) {
    error.value = messageOf(e, 'Could not delete the project')
  }
}
</script>

<template>
  <div class="space-y-6 rounded-xl border border-default p-4">
    <div>
      <h3 class="text-sm font-semibold text-default">
        Archive
      </h3>
      <p class="mt-1 text-xs text-muted">
        An archived project is hidden from the project lists and its rules stop running. Its board stays open and its tasks can still be edited. You can unarchive it at any time.
      </p>
      <button
        class="mt-3 rounded-lg border border-default px-3 py-1.5 text-xs text-default transition-colors hover:bg-elevated disabled:opacity-60"
        :disabled="archiving || !activeProject"
        data-archive-toggle
        @click="toggleArchive"
      >
        {{ activeProject?.archivedAt ? 'Unarchive project' : 'Archive project' }}
      </button>
    </div>

    <div class="border-t border-default pt-6">
      <h3 class="text-sm font-semibold text-error">
        Delete
      </h3>
      <p class="mt-1 text-xs text-muted">
        Deleting removes every column, task and comment in this project. It cannot be undone.
      </p>
      <button
        class="mt-3 rounded-lg border border-error/40 px-3 py-1.5 text-xs text-error transition-colors hover:bg-error/10"
        data-delete-open
        @click="openDelete"
      >
        Delete project
      </button>
    </div>

    <UModal
      v-model:open="deleteOpen"
      title="Delete this project?"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <div class="space-y-3 text-sm text-default">
          <p>
            This deletes <strong>{{ activeProject?.name }}</strong> with its {{ taskTotal }} {{ taskTotal === 1 ? 'task' : 'tasks' }}, all its columns and comments. It cannot be undone.
          </p>
          <label
            for="project-delete-confirm"
            class="block text-xs text-muted"
          >Type the project name to confirm</label>
          <input
            id="project-delete-confirm"
            v-model="deleteConfirm"
            type="text"
            class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm text-default outline-none focus:border-error"
            data-delete-confirm
            :placeholder="activeProject?.name"
          >
        </div>
      </template>
      <template #footer>
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="deleteOpen = false"
        />
        <UButton
          label="Delete project"
          color="error"
          :disabled="!canDelete"
          data-delete-confirm-button
          @click="confirmDelete"
        />
      </template>
    </UModal>

    <p
      v-if="error"
      class="text-xs text-error"
    >
      {{ error }}
    </p>
  </div>
</template>
