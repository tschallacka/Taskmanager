<script setup lang="ts">
// The General section of project settings: name, description and status. The
// parent mounts this for team members only.
const props = defineProps<{ projectId: string }>()

const { activeProject, renameProject, updateProjectDetails, archiveProject, unarchiveProject, setProjectOwner, deleteProject, board } = useProjects()

const STATUSES = [
  { key: 'on_track', label: 'On track', dot: 'bg-success' },
  { key: 'at_risk', label: 'At risk', dot: 'bg-warning' },
  { key: 'off_track', label: 'Off track', dot: 'bg-error' }
] as const

const name = ref('')
const description = ref('')
// Typing is kept while the server answers; a changed copy from the server only
// replaces the draft when nothing is being typed.
const descriptionDirty = ref(false)
const error = ref('')
const saved = ref(false)
let savedTimer: ReturnType<typeof setTimeout> | undefined

watch(() => activeProject.value?.name, (value) => {
  name.value = value ?? ''
}, { immediate: true })

watch(() => activeProject.value?.description, (value) => {
  if (!descriptionDirty.value) description.value = value ?? ''
}, { immediate: true })

function messageOf(e: unknown, fallback: string) {
  const data = (e as { data?: { message?: unknown } })?.data
  return typeof data?.message === 'string' ? data.message : fallback
}

function flashSaved() {
  saved.value = true
  clearTimeout(savedTimer)
  savedTimer = setTimeout(() => saved.value = false, 1500)
}

// Enter ends the edit, and the blur it causes does the saving.
function blurOnEnter(event: KeyboardEvent) {
  ;(event.target as HTMLInputElement).blur()
}

async function saveName() {
  const project = activeProject.value
  const next = name.value.trim()
  if (!project) return
  if (!next) {
    name.value = project.name
    return
  }
  if (next === project.name) return
  error.value = ''
  try {
    await renameProject(props.projectId, next)
    flashSaved()
  } catch (e) {
    error.value = messageOf(e, 'Could not rename the project')
    name.value = project.name
  }
}

async function saveDescription() {
  if (description.value === (activeProject.value?.description ?? '')) {
    descriptionDirty.value = false
    return
  }
  error.value = ''
  try {
    await updateProjectDetails(props.projectId, { description: description.value })
    descriptionDirty.value = false
    flashSaved()
  } catch (e) {
    error.value = messageOf(e, 'Could not save the description')
  }
}

// Clicking the current status clears it, as on the Overview.
async function setStatus(key: (typeof STATUSES)[number]['key']) {
  const next = activeProject.value?.status === key ? null : key
  error.value = ''
  try {
    await updateProjectDetails(props.projectId, { status: next })
    flashSaved()
  } catch (e) {
    error.value = messageOf(e, 'Could not change the status')
  }
}
// ─── Owner ─────────────────────────────────────────────────

// The team members a project can be recorded under. Customer contacts are not owners.
interface Person { id: string, name: string, email: string, kind: 'staff' | 'customer' }
const people = ref<Person[]>([])
const staff = computed(() => people.value.filter(p => p.kind === 'staff'))
// Only the owner may hand the project to someone else; the server checks this too.
const { session } = useAuth()
const isOwner = computed(() => session.value?.user?.id === activeProject.value?.userId)

onMounted(() => {
  $fetch<Person[]>(`/api/projects/${props.projectId}/people`)
    .then((list) => { people.value = list })
    .catch(() => {})
})

async function changeOwner(event: Event) {
  const next = (event.target as HTMLSelectElement).value
  if (!next || next === activeProject.value?.userId) return
  error.value = ''
  try {
    await setProjectOwner(props.projectId, next)
    flashSaved()
  } catch (e) {
    error.value = messageOf(e, 'Could not change the owner')
  }
}

// ─── Crews ─────────────────────────────────────────────────
// The board level of the crew permission. It is on only where the instance and the team allow crews too.

const crewLevels = ref<{ crewsAllowed: boolean, teamAllowed: boolean, instanceAllowed: boolean } | null>(null)
const savingCrews = ref(false)

async function loadCrewLevels() {
  try {
    crewLevels.value = await $fetch<{ crewsAllowed: boolean, teamAllowed: boolean, instanceAllowed: boolean }>(`/api/projects/${props.projectId}/crews-allowed`)
  } catch {
    crewLevels.value = null
  }
}

watch(() => props.projectId, loadCrewLevels, { immediate: true })

async function setBoardCrews(allowed: boolean) {
  error.value = ''
  savingCrews.value = true
  try {
    await $fetch(`/api/projects/${props.projectId}/crews-allowed`, { method: 'PUT', body: { crewsAllowed: allowed } })
    await loadCrewLevels()
    flashSaved()
  } catch (e) {
    error.value = messageOf(e, 'Could not save the crew setting')
  } finally {
    savingCrews.value = false
  }
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
    flashSaved()
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
  <div class="space-y-8">
    <div>
      <label
        for="project-settings-name"
        class="text-sm font-semibold text-default"
      >Name</label>
      <input
        id="project-settings-name"
        v-model="name"
        type="text"
        class="mt-2 w-full rounded-lg border border-default bg-default px-3 py-2 text-sm text-default outline-none focus:border-primary"
        data-settings-name
        @keydown.enter.prevent="blurOnEnter"
        @blur="saveName"
      >
    </div>

    <div>
      <label
        for="project-settings-description"
        class="text-sm font-semibold text-default"
      >Description</label>
      <textarea
        id="project-settings-description"
        v-model="description"
        rows="6"
        placeholder="What is this project about? Add goals, links and context for everyone working on it."
        class="mt-2 w-full resize-y rounded-xl border border-default bg-default p-3 text-sm leading-relaxed text-default outline-none transition-shadow placeholder:text-dimmed focus:border-primary focus:ring-2 focus:ring-primary/20"
        data-settings-description
        @input="descriptionDirty = true"
        @blur="saveDescription"
      />
    </div>

    <div>
      <h3 class="text-sm font-semibold text-default">
        Status
      </h3>
      <div class="mt-2 flex flex-wrap gap-2">
        <button
          v-for="status in STATUSES"
          :key="status.key"
          class="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors"
          :class="activeProject?.status === status.key
            ? 'border-primary bg-primary/10 font-medium text-default'
            : 'border-default text-muted hover:bg-elevated'"
          :data-status="status.key"
          @click="setStatus(status.key)"
        >
          <span
            class="size-2 rounded-full"
            :class="status.dot"
          />
          {{ status.label }}
        </button>
      </div>
    </div>

    <div class="border-t border-default pt-6">
      <label
        for="project-settings-owner"
        class="text-sm font-semibold text-default"
      >Owner</label>
      <p class="mt-1 text-xs text-muted">
        The team member this project is recorded under. Who can see the project does not change.
      </p>
      <select
        id="project-settings-owner"
        class="mt-2 w-full rounded-lg border border-default bg-default px-3 py-2 text-sm text-default outline-none focus:border-primary disabled:opacity-60"
        data-owner-select
        :value="activeProject?.userId ?? ''"
        :disabled="staff.length < 2 || !isOwner"
        @change="changeOwner"
      >
        <option
          v-for="person in staff"
          :key="person.id"
          :value="person.id"
        >
          {{ person.name || person.email }}
        </option>
      </select>
      <p
        v-if="!isOwner"
        class="mt-1 text-xs text-muted"
      >
        Only the project owner can hand the project to someone else.
      </p>
    </div>

    <div
      v-if="crewLevels"
      class="border-t border-default pt-6"
      data-board-crews
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-semibold text-default">
            Crews may work on this board
          </h3>
          <p class="mt-1 text-xs text-muted">
            <template v-if="!crewLevels.instanceAllowed">
              Your admin has not allowed crews on this instance, so this cannot be turned on yet.
            </template>
            <template v-else-if="!crewLevels.teamAllowed">
              The owner or admin of this team has not allowed crews for its boards yet. Ask them first.
            </template>
            <template v-else>
              A crew may only work on a board whose switch is on, and the instance and the team allow crews. Turning this off disables the crews on this board.
            </template>
          </p>
        </div>
        <USwitch
          :model-value="crewLevels.crewsAllowed"
          :disabled="savingCrews || (!crewLevels.crewsAllowed && (!crewLevels.instanceAllowed || !crewLevels.teamAllowed))"
          aria-label="Crews may work on this board"
          @update:model-value="setBoardCrews"
        />
      </div>
    </div>

    <div
      v-if="crewLevels"
      class="border-t border-default pt-6"
    >
      <RateLimitFields
        :url="`/api/projects/${projectId}/rate-limits`"
        title="Rate limits for this board"
        hint="At most this many of each in the window, on top of the team's and the instance's limits."
      />
    </div>

    <div class="border-t border-default pt-6">
      <h3 class="text-sm font-semibold text-default">
        Backup
      </h3>
      <p class="mt-1 text-xs text-muted">
        Downloads the board as one file, with each item's date and author. Team members get all of it: cards, subtasks, labels, custom fields, comments, time logs, status updates, messages and rules. Customer contacts, guests and agent keys get only the cards and comments they can see, and nobody else's email address. Attachments are listed by name, not included. Passwords, keys, tokens and sign-in data are never in the file.
      </p>
      <a
        :href="`/api/projects/${projectId}/backup`"
        download
        class="mt-3 inline-block rounded-lg border border-default px-3 py-1.5 text-xs text-default transition-colors hover:bg-elevated"
        data-backup-download
      >
        Download backup
      </a>
    </div>

    <div class="border-t border-default pt-6">
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
    <p
      class="h-4 text-xs text-success transition-opacity"
      :class="saved ? 'opacity-100' : 'opacity-0'"
    >
      Saved
    </p>
  </div>
</template>
