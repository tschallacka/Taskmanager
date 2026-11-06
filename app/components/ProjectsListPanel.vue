<script setup lang="ts">
import { relativeTime } from '~/composables/useRelativeTime'
import type { Project } from '~/composables/useProjects'
import type { PinnedBoard } from '~/composables/usePins'
import type { BoardMenuBoard } from '~/composables/useBoardMenu'
import type { DropdownMenuItem } from '@nuxt/ui'
import { taskCountLabel } from '#shared/utils/board'

const { ready, projects, allTasks, deleteProject, renameProject } = useProjects()
const route = useRoute()
const { unread: inboxUnread } = useNotifications()
const { pins, pinsLoaded, loadPins, isPinned } = usePins()
const { activeTeamId, isTeamAdmin } = useTeams()
const { switchWorkspace } = useWorkspace()

const activeId = computed(() => (route.params.id as string | undefined) ?? null)

function openProject(id: string) {
  if (route.path !== `/projects/${id}`) navigateTo(`/projects/${id}`)
}

// ─── Pins ──────────────────────────────────────────────────
// Pins come from every workspace. A board in the open workspace shows its live name from
// the project list; one elsewhere shows the name it had when the list was last loaded.

onMounted(() => {
  if (!pinsLoaded.value) loadPins().catch(() => {})
})
// A team switch can add or drop a membership's boards (joining, leaving), so reload then.
watch(activeTeamId, () => loadPins().catch(() => {}))

function pinName(pin: PinnedBoard) {
  return projects.value.find(p => p.id === pin.projectId)?.name ?? pin.name
}

function pinPlace(pin: PinnedBoard) {
  return [pin.teamName ?? 'Personal Workspace', pin.customerName].filter(Boolean).join(' · ')
}

// A board in another workspace switches to it first, as the team switcher does, then opens it.
async function openPin(pin: PinnedBoard) {
  await switchWorkspace(pin.teamId)
  await navigateTo(`/projects/${pin.projectId}`)
}

// Project creation lives on one surface only: /projects?new=1.
function newProject() {
  navigateTo('/projects?new=1')
}

// "47 tasks" on a board six months old says nothing — almost all of them are
// finished. Counting what is still short of the board's finishing columns says
// how much is left, and the total is still there behind it.
const taskCounts = computed(() => {
  const terminal = new Map(projects.value.map(p => [p.id, new Set(p.terminalColumnIds ?? [])]))
  const counts = new Map<string, { open: number, total: number }>()
  for (const task of allTasks.value) {
    const entry = counts.get(task.projectId) ?? { open: 0, total: 0 }
    entry.total++
    if (!terminal.get(task.projectId)?.has(task.columnId)) entry.open++
    counts.set(task.projectId, entry)
  }
  return counts
})

function countsFor(project: Project) {
  return taskCounts.value.get(project.id) ?? { open: 0, total: 0 }
}

function countLabel(project: Project) {
  const { open, total } = countsFor(project)
  return taskCountLabel(open, total, (project.terminalColumnIds?.length ?? 0) > 0)
}

function countTitle(project: Project) {
  const { open, total } = countsFor(project)
  return project.terminalColumnIds?.length ? `${open} open of ${total}` : `${total} in total`
}

// ─── Inline rename / delete ────────────────────────────────

const renamingId = ref<string | null>(null)
const renameValue = ref('')

async function startRename(project: { id: string, name: string }) {
  renamingId.value = project.id
  renameValue.value = project.name
  // A `ref` inside v-for collects into an array, so the one mounted input is
  // picked up from the DOM instead.
  await nextTick()
  document.querySelector<HTMLInputElement>('[data-project-rename]')?.select()
}

async function commitRename(project: { id: string, name: string }) {
  const id = renamingId.value
  const name = renameValue.value.trim()
  renamingId.value = null
  if (id && name && name !== project.name) {
    await renameProject(id, name)
    if (isPinned(id)) loadPins().catch(() => {})
  }
}

const WORKSPACE_LINKS = [
  { to: '/projects/home', label: 'Home', icon: 'i-lucide-house' },
  { to: '/projects/inbox', label: 'Inbox', icon: 'i-lucide-inbox' },
  { to: '/projects/my-tasks', label: 'My tasks', icon: 'i-lucide-circle-check' },
  { to: '/projects/browse', label: 'Browse projects', icon: 'i-lucide-folder-search' },
  { to: '/projects/goals', label: 'Goals', icon: 'i-lucide-target' },
  { to: '/projects/portfolios', label: 'Portfolios', icon: 'i-lucide-layout-grid' },
  { to: '/projects/timesheet', label: 'Timesheet', icon: 'i-lucide-clock' },
  { to: '/projects/profile', label: 'Profile', icon: 'i-lucide-user-round' }
]

const deleteTarget = ref<{ id: string, name: string } | null>(null)

async function confirmDelete() {
  const target = deleteTarget.value
  deleteTarget.value = null
  if (!target) return
  await deleteProject(target.id)
  if (isPinned(target.id)) loadPins().catch(() => {})
  if (activeId.value === target.id) navigateTo('/projects')
}

// The sidebar adds what only the sidebar does to a board's menu: give it a crew (a team's owner or
// admin; the Crews section of /team does the attaching) and delete it.
function sidebarMenuExtra(board: BoardMenuBoard): DropdownMenuItem[][] {
  const groups: DropdownMenuItem[][] = []
  if (isTeamAdmin.value) {
    groups.push([{
      label: 'Give it a crew',
      icon: 'i-lucide-users-round',
      onSelect: () => { void navigateTo({ path: '/team', query: { section: 'crews', board: board.id, wizard: '1' } }) }
    }])
  }
  groups.push([{
    label: 'Delete project',
    icon: 'i-lucide-trash-2',
    color: 'error' as const,
    onSelect: () => { deleteTarget.value = { id: board.id, name: board.name } }
  }])
  return groups
}

// A board listed here renames in its row; one from another workspace opens and renames itself.
function renameInSidebar(board: BoardMenuBoard) {
  if (projects.value.some(p => p.id === board.id)) startRename(board)
  else navigateTo({ path: `/projects/${board.id}`, query: { rename: '1' } })
}

// A pinned board as a menu's board: its live name when the list has it.
function pinAsBoard(pin: PinnedBoard): BoardMenuBoard {
  return { id: pin.projectId, name: pinName(pin), audience: projects.value.find(p => p.id === pin.projectId)?.audience }
}
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <nav
      class="mb-2 flex flex-col gap-0.5 border-b border-default pb-2"
      aria-label="Workspace"
    >
      <NuxtLink
        v-for="link in WORKSPACE_LINKS"
        :key="link.to"
        :to="link.to"
        class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted transition-colors hover:bg-elevated hover:text-default"
        active-class="bg-elevated font-medium text-default"
      >
        <UIcon
          :name="link.icon"
          class="size-4"
        />
        {{ link.label }}
        <span
          v-if="link.to === '/projects/inbox' && inboxUnread"
          class="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[0.625rem] font-semibold leading-none tabular-nums text-inverted"
          data-inbox-badge
        >{{ inboxUnread > 99 ? '99+' : inboxUnread }}</span>
      </NuxtLink>
    </nav>

    <RunningTimer />

    <template v-if="pins.length">
      <div class="px-2 pb-1">
        <span class="text-xs font-semibold uppercase tracking-wider text-dimmed">Pinned</span>
      </div>
      <BoardMenu
        v-for="pin in pins"
        :key="pin.projectId"
        mode="context"
        :board="pinAsBoard(pin)"
        :rename="renameInSidebar"
        :extra="sidebarMenuExtra"
      >
        <div
          class="group flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-1.5 transition-colors"
          :class="activeId === pin.projectId ? 'bg-elevated' : 'hover:bg-elevated/60'"
          tabindex="0"
          data-pinned-board
          @click="openPin(pin)"
          @keydown.enter="openPin(pin)"
        >
          <UIcon
            name="i-lucide-pin"
            class="mt-0.5 size-4 shrink-0"
            :class="activeId === pin.projectId ? 'text-primary' : 'text-dimmed group-hover:text-muted'"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium leading-snug text-default">
              {{ pinName(pin) }}
            </p>
            <p class="truncate text-xs text-muted">
              {{ pinPlace(pin) }}
            </p>
          </div>
          <BoardMenu
            mode="button"
            :board="pinAsBoard(pin)"
            :rename="renameInSidebar"
            :extra="sidebarMenuExtra"
            button-class="mt-0.5 shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
          />
        </div>
      </BoardMenu>
      <div class="mb-2 border-b border-default pb-2" />
    </template>

    <div class="flex items-center justify-between px-2 pb-1">
      <span class="text-xs font-semibold uppercase tracking-wider text-dimmed">Projects</span>
      <UButton
        icon="i-lucide-plus"
        size="xs"
        color="neutral"
        variant="ghost"
        aria-label="New project"
        @click="newProject"
      />
    </div>

    <p
      v-if="ready && projects.length === 0"
      class="px-2 py-3 text-xs text-dimmed"
    >
      No projects yet.
      <button
        class="text-primary hover:underline"
        @click="newProject"
      >
        Create one
      </button>
    </p>

    <template
      v-for="project in projects"
      :key="project.id"
    >
      <input
        v-if="renamingId === project.id"
        v-model="renameValue"
        data-project-rename
        class="w-full rounded-lg bg-default px-2.5 py-1.5 text-sm font-medium text-default outline-none ring-1 ring-primary"
        @keydown.enter.prevent="commitRename(project)"
        @keydown.escape="renamingId = null"
        @blur="commitRename(project)"
      >
      <BoardMenu
        v-else
        mode="context"
        :board="project"
        :rename="renameInSidebar"
        :extra="sidebarMenuExtra"
      >
        <div
          class="group flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-1.5 transition-colors"
          :class="activeId === project.id ? 'bg-elevated' : 'hover:bg-elevated/60'"
          tabindex="0"
          @click="openProject(project.id)"
          @keydown.enter="openProject(project.id)"
        >
          <UIcon
            :name="project.customerId ? 'i-lucide-building-2' : 'i-lucide-kanban'"
            class="mt-0.5 size-4 shrink-0"
            :class="activeId === project.id ? 'text-primary' : 'text-dimmed group-hover:text-muted'"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium leading-snug text-default">
              {{ project.name }}
            </p>
            <p
              class="truncate text-xs text-muted"
              :title="countTitle(project)"
            >
              {{ project.customerName ? `${project.customerName} · ` : '' }}{{ relativeTime(project.updatedAt) }} · {{ countLabel(project) }} {{ countsFor(project).total === 1 ? 'task' : 'tasks' }}
            </p>
          </div>
          <!-- The menu keeps its slot even when invisible, so rows never jump on hover. -->
          <BoardMenu
            mode="button"
            :board="project"
            :rename="renameInSidebar"
            :extra="sidebarMenuExtra"
            button-class="mt-0.5 shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
          />
        </div>
      </BoardMenu>
    </template>

    <UModal
      :open="deleteTarget !== null"
      title="Delete project?"
      description="Columns, tasks and updates are deleted with it. This cannot be undone."
      :ui="{ footer: 'justify-end' }"
      @update:open="(v: boolean) => { if (!v) deleteTarget = null }"
    >
      <template #footer>
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="deleteTarget = null"
        />
        <UButton
          label="Delete project"
          color="error"
          @click="confirmDelete"
        />
      </template>
    </UModal>
  </div>
</template>
