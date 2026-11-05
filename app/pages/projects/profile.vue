<script setup lang="ts">
import { format } from 'date-fns'
import { dueDayToMs, isOverdueDay } from '~/utils/dueDate'
import type { ProjectPerson } from '~/composables/useProjects'

definePageMeta({ layout: 'app' })

const { sidebarOpen } = useSidebar()
useSeoMeta({ title: 'Profile' })

const { session } = useAuth()
const { ready, projects, allTasks } = useProjects()

const me = computed(() => session.value?.user)

const mine = computed(() =>
  allTasks.value
    .filter(task => task.assigneeId === me.value?.id && task.completedAt == null)
    .sort((a, b) => (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999'))
    .slice(0, 8)
)

const collaborators = ref<ProjectPerson[]>([])

watch(projects, async (list) => {
  const groups = await Promise.all(
    list.slice(0, 10).map(project => $fetch<ProjectPerson[]>(`/api/projects/${project.id}/people`).catch(() => [] as ProjectPerson[]))
  )
  const seen = new Map<string, ProjectPerson>()
  for (const person of groups.flat()) {
    if (person.id !== me.value?.id) seen.set(person.id, person)
  }
  collaborators.value = [...seen.values()]
}, { immediate: true })
</script>

<template>
  <div class="flex min-w-0 flex-1 flex-col overflow-y-auto">
    <header class="flex shrink-0 items-center gap-2 px-4 py-3 lg:hidden">
      <UButton
        icon="i-lucide-panel-left"
        color="neutral"
        variant="ghost"
        size="sm"
        aria-label="Open sidebar"
        @click="sidebarOpen = true"
      />
    </header>

    <div class="mx-auto w-full max-w-4xl px-4 pb-12 pt-6 lg:px-6">
      <div class="flex items-center gap-5">
        <UAvatar
          :src="me?.image ?? undefined"
          :alt="me?.name"
          size="3xl"
        />
        <div class="min-w-0">
          <h1
            class="truncate text-3xl font-semibold text-default"
            data-profile-name
          >
            {{ me?.name }}
          </h1>
          <p class="truncate text-sm text-muted">
            {{ me?.email }}
          </p>
          <NuxtLink
            to="/settings"
            class="mt-2 inline-block text-xs text-primary hover:underline"
          >
            Edit profile in settings
          </NuxtLink>
        </div>
      </div>

      <div class="mt-8 grid gap-4 md:grid-cols-5">
        <section class="rounded-2xl border border-default bg-default p-5 md:col-span-3">
          <div class="flex items-center justify-between">
            <h2 class="text-base font-semibold text-default">
              My tasks
            </h2>
            <NuxtLink
              to="/projects/my-tasks"
              class="text-xs text-primary hover:underline"
            >
              View all tasks
            </NuxtLink>
          </div>
          <p
            v-if="ready && !mine.length"
            class="py-8 text-center text-sm text-muted"
          >
            Nothing assigned to you.
          </p>
          <ul
            v-else
            class="mt-3 divide-y divide-default"
          >
            <li
              v-for="task in mine"
              :key="task.id"
            >
              <NuxtLink
                :to="`/projects/${task.projectId}?task=${task.id}`"
                class="flex items-center gap-3 py-2 text-sm transition-colors hover:bg-elevated/50"
              >
                <span class="min-w-0 flex-1 truncate text-default">{{ task.title }}</span>
                <span class="hidden max-w-36 shrink-0 truncate text-xs text-dimmed sm:block">{{ task.projectName }}</span>
                <span
                  class="shrink-0 text-xs tabular-nums"
                  :class="task.dueOn && isOverdueDay(task.dueOn) ? 'text-error' : 'text-dimmed'"
                >{{ task.dueOn ? format(dueDayToMs(task.dueOn), 'MMM d') : '' }}</span>
              </NuxtLink>
            </li>
          </ul>
        </section>

        <section class="rounded-2xl border border-default bg-default p-5 md:col-span-2">
          <h2 class="text-base font-semibold text-default">
            Frequent collaborators
          </h2>
          <p
            v-if="!collaborators.length"
            class="py-8 text-center text-sm text-muted"
            data-no-collaborators
          >
            Invite teammates under Team, Members, or share a board with a guest, to work together.
          </p>
          <ul
            v-else
            class="mt-3 space-y-2"
          >
            <li
              v-for="person in collaborators"
              :key="person.id"
              class="flex items-center gap-2.5 text-sm text-default"
            >
              <PersonCard
                :person-id="person.id"
                :name="person.name || person.email || ''"
                :image="person.image"
                class="min-w-0"
              >
                <span class="flex min-w-0 items-center gap-2.5">
                  <UAvatar
                    :src="person.image ?? undefined"
                    :alt="person.name || person.email || ''"
                    size="sm"
                  />
                  <span class="truncate">{{ person.name || person.email }}</span>
                </span>
              </PersonCard>
            </li>
          </ul>
        </section>

        <section class="rounded-2xl border border-default bg-default p-5 md:col-span-5">
          <h2 class="text-base font-semibold text-default">
            My recent projects
          </h2>
          <ul class="mt-3 grid gap-1 sm:grid-cols-2">
            <li
              v-for="project in projects.slice(0, 8)"
              :key="project.id"
            >
              <NuxtLink
                :to="`/projects/${project.id}`"
                class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-default transition-colors hover:bg-elevated"
              >
                <UIcon
                  name="i-lucide-kanban"
                  class="size-4 text-primary"
                />
                <span class="truncate">{{ project.name }}</span>
              </NuxtLink>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>
