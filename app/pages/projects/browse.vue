<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'

definePageMeta({ layout: 'app' })

useSeoMeta({ title: 'Browse projects' })

const { projects, allTasks, unarchiveProject } = useProjects()

// Archived projects leave every list, so this is the only place to find them again.
interface ArchivedRow { id: string, name: string, archivedAt: number | null }
const archived = ref<ArchivedRow[]>([])
const restoringId = ref('')
const archivedError = ref('')

async function loadArchived() {
  try {
    const list = await $fetch<ArchivedRow[]>('/api/projects', { query: { archived: '1' } })
    archived.value = list.filter(project => project.archivedAt != null)
  } catch {
    archived.value = []
  }
}

async function restore(project: ArchivedRow) {
  restoringId.value = project.id
  archivedError.value = ''
  try {
    await unarchiveProject(project.id)
    archived.value = archived.value.filter(row => row.id !== project.id)
  } catch (e) {
    archivedError.value = (e as { data?: { message?: string } })?.data?.message || 'Could not unarchive the project'
  } finally {
    restoringId.value = ''
  }
}

onMounted(loadArchived)

const query = ref('')

const STATUS_DOT: Record<string, string> = { on_track: 'bg-success', at_risk: 'bg-warning', off_track: 'bg-error' }

const rows = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return projects.value
    .filter(project => !needle || project.name.toLowerCase().includes(needle))
    .map((project) => {
      const own = allTasks.value.filter(task => task.projectId === project.id)
      return { project, total: own.length, open: own.filter(task => task.completedAt == null).length }
    })
})
</script>

<template>
  <div class="flex min-w-0 flex-1 flex-col">
    <Teleport
      defer
      to="#app-topbar-title"
    >
      <h1 class="text-base font-semibold text-default">
        Browse projects
      </h1>
    </Teleport>

    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
      <div class="relative max-w-md">
        <UIcon
          name="i-lucide-search"
          class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dimmed"
        />
        <input
          v-model="query"
          placeholder="Find a project"
          data-browse-search
          class="w-full rounded-full border border-default bg-default py-2 pl-9 pr-3 text-sm text-default outline-none transition-shadow placeholder:text-dimmed focus:border-primary focus:ring-2 focus:ring-primary/20"
        >
      </div>

      <div class="mt-4 overflow-hidden rounded-xl border border-default bg-default">
        <div class="grid grid-cols-[1fr_4rem_4rem] gap-3 border-b border-default px-4 py-2 text-xs text-dimmed sm:grid-cols-[1fr_5rem_5rem_8rem]">
          <span>Name</span>
          <span class="text-right">Open</span>
          <span class="text-right">Total</span>
          <span class="hidden text-right sm:block">Updated</span>
        </div>
        <NuxtLink
          v-for="{ project, open, total } in rows"
          :key="project.id"
          :to="`/projects/${project.id}`"
          data-browse-row
          class="grid grid-cols-[1fr_4rem_4rem] items-center gap-3 border-b border-default px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-elevated/60 sm:grid-cols-[1fr_5rem_5rem_8rem]"
        >
          <span class="flex min-w-0 items-center gap-2.5">
            <span class="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
              <UIcon
                name="i-lucide-kanban"
                class="size-4"
              />
            </span>
            <span class="truncate font-medium text-default">{{ project.name }}</span>
            <span
              v-if="project.status"
              class="size-2 shrink-0 rounded-full"
              :class="STATUS_DOT[project.status]"
            />
          </span>
          <span class="text-right tabular-nums text-muted">{{ open }}</span>
          <span class="text-right tabular-nums text-muted">{{ total }}</span>
          <span class="hidden text-right text-xs text-dimmed sm:block">{{ formatDistanceToNow(project.updatedAt, { addSuffix: true }) }}</span>
        </NuxtLink>
        <p
          v-if="!rows.length"
          class="px-4 py-6 text-center text-sm text-muted"
        >
          No projects match.
        </p>
      </div>
      <div
        v-if="archived.length"
        class="mt-8"
      >
        <h2 class="text-sm font-semibold text-default">
          Archived
        </h2>
        <p class="mt-1 text-xs text-muted">
          Hidden from the lists. Their boards still open, and their rules do not run until they are unarchived.
        </p>
        <div class="mt-3 overflow-hidden rounded-xl border border-default bg-default">
          <div
            v-for="project in archived"
            :key="project.id"
            data-browse-archived
            class="flex items-center gap-3 border-b border-default px-4 py-3 text-sm last:border-b-0"
          >
            <NuxtLink
              :to="`/projects/${project.id}`"
              class="min-w-0 flex-1 truncate font-medium text-default hover:underline"
            >
              {{ project.name }}
            </NuxtLink>
            <span
              v-if="project.archivedAt"
              class="hidden shrink-0 text-xs text-dimmed sm:block"
            >Archived {{ formatDistanceToNow(project.archivedAt, { addSuffix: true }) }}</span>
            <UButton
              size="sm"
              color="neutral"
              variant="soft"
              data-unarchive
              :loading="restoringId === project.id"
              @click="restore(project)"
            >
              Unarchive
            </UButton>
          </div>
        </div>
        <p
          v-if="archivedError"
          class="mt-2 text-sm text-error"
        >
          {{ archivedError }}
        </p>
      </div>
    </div>
  </div>
</template>
