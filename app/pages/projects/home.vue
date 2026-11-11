<script setup lang="ts">
import { format } from 'date-fns'
import { dueDayToMs, isOverdueDay } from '~/utils/dueDate'

definePageMeta({ layout: 'app' })

useSeoMeta({ title: 'Home' })

const { session } = useAuth()
const { ready, projects, allTasks, updateTask } = useProjects()

const greeting = computed(() => {
  const hour = new Date().getHours()
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  const first = (session.value?.user.name ?? '').split(' ')[0]
  return `Good ${part}${first ? `, ${first}` : ''}`
})

const mine = computed(() => allTasks.value.filter(task => task.assigneeId === session.value?.user.id))
const upcoming = computed(() =>
  mine.value
    .filter(task => task.completedAt == null)
    .sort((a, b) => (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999'))
    .slice(0, 6)
)
const completedCount = computed(() => mine.value.filter(task => task.completedAt != null).length)
const recent = computed(() => projects.value.slice(0, 6))

function openTask(task: { id: string, projectId: string }) {
  navigateTo(`/projects/${task.projectId}?task=${task.id}`)
}
</script>

<template>
  <div class="flex min-w-0 flex-1 flex-col overflow-y-auto">
    <Teleport
      defer
      to="#app-topbar-title"
    >
      <h1 class="text-base font-semibold text-default">
        Home
      </h1>
    </Teleport>

    <div class="mx-auto w-full max-w-4xl px-4 pb-12 pt-6 lg:px-6">
      <p class="text-sm text-muted">
        {{ format(new Date(), 'EEEE, MMMM d') }}
      </p>
      <div class="mt-1 flex flex-wrap items-baseline justify-between gap-2">
        <h1
          class="text-3xl font-semibold text-default"
          data-greeting
        >
          {{ greeting }}
        </h1>
        <span class="text-sm text-muted">{{ completedCount }} {{ completedCount === 1 ? 'task' : 'tasks' }} completed</span>
      </div>

      <div class="mt-6 grid gap-4 md:grid-cols-5">
        <section class="rounded-2xl border border-default bg-default p-5 md:col-span-3">
          <div class="flex items-center justify-between">
            <h2 class="text-base font-semibold text-default">
              My tasks
            </h2>
            <NuxtLink
              to="/projects/my-tasks"
              class="text-xs text-primary hover:underline"
            >
              View all
            </NuxtLink>
          </div>
          <p
            v-if="ready && !upcoming.length"
            class="py-8 text-center text-sm text-muted"
          >
            Nothing assigned to you.
          </p>
          <ul
            v-else
            class="mt-3 divide-y divide-default"
          >
            <li
              v-for="task in upcoming"
              :key="task.id"
              data-home-task
              class="flex cursor-pointer items-center gap-3 py-2 transition-colors hover:bg-elevated/50"
              @click="openTask(task)"
            >
              <button
                class="flex size-5 shrink-0 items-center justify-center rounded-full border border-accented text-transparent transition-colors hover:border-success hover:text-success"
                aria-label="Mark complete"
                @click.stop="updateTask(task.id, { completed: true })"
              >
                <UIcon
                  name="i-lucide-check"
                  class="size-3"
                />
              </button>
              <span class="min-w-0 flex-1 truncate text-sm text-default">{{ task.title }}</span>
              <span
                class="shrink-0 text-xs tabular-nums"
                :class="task.dueOn && isOverdueDay(task.dueOn) ? 'text-error' : 'text-dimmed'"
              >{{ task.dueOn ? format(dueDayToMs(task.dueOn), 'MMM d') : '' }}</span>
            </li>
          </ul>
        </section>

        <section class="rounded-2xl border border-default bg-default p-5 md:col-span-2">
          <div class="flex items-center justify-between">
            <h2 class="text-base font-semibold text-default">
              Projects
            </h2>
            <NuxtLink
              to="/projects/browse"
              class="text-xs text-primary hover:underline"
            >
              Browse
            </NuxtLink>
          </div>
          <ul class="mt-3 space-y-1">
            <li
              v-for="project in recent"
              :key="project.id"
            >
              <NuxtLink
                :to="`/projects/${project.id}`"
                class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-default transition-colors hover:bg-elevated"
              >
                <span class="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                  <UIcon
                    name="i-lucide-kanban"
                    class="size-3.5"
                  />
                </span>
                <span class="truncate">{{ project.name }}</span>
              </NuxtLink>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>
