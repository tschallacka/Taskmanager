<script setup lang="ts">
import { format } from 'date-fns'
import { dueDayToMs, isOverdueDay } from '~/utils/dueDate'
import type { TaskSearchRow } from '~/composables/useProjects'

definePageMeta({ layout: 'app' })

useSeoMeta({ title: 'My tasks' })

const { session } = useAuth()
const { ready, allTasks, updateTask } = useProjects()

const TABS = ['Upcoming', 'Overdue', 'Completed'] as const
const tab = ref<(typeof TABS)[number]>('Upcoming')

const mine = computed(() => allTasks.value.filter(task => task.assigneeId === session.value?.user.id))

function overdue(task: TaskSearchRow) {
  return !!task.dueOn && !task.completedAt && isOverdueDay(task.dueOn)
}

const shown = computed(() => {
  const list = mine.value.filter((task) => {
    if (tab.value === 'Completed') return task.completedAt != null
    if (task.completedAt != null) return false
    return tab.value === 'Overdue' ? overdue(task) : !overdue(task)
  })
  return [...list].sort((a, b) => (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999'))
})

const overdueCount = computed(() => mine.value.filter(overdue).length)

function open(task: { id: string, projectId: string }) {
  navigateTo(`/projects/${task.projectId}?task=${task.id}`)
}

// The same tasks drawn as a list or as a board, chosen in the address like the
// project views are.
const route = useRoute()
const view = computed(() => route.query.view === 'board' ? 'board' : 'list')

function setView(next: 'list' | 'board') {
  navigateTo({ query: next === 'board' ? { view: 'board' } : {} }, { replace: true })
}
</script>

<template>
  <div class="flex min-w-0 flex-1 flex-col">
    <Teleport
      defer
      to="#app-topbar-title"
    >
      <h1 class="text-base font-semibold text-default">
        My tasks
      </h1>
    </Teleport>
    <Teleport
      defer
      to="#app-topbar-actions"
    >
      <div class="flex items-center gap-0.5 rounded-lg bg-elevated p-0.5">
        <button
          v-for="option in (['list', 'board'] as const)"
          :key="option"
          class="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs capitalize transition-colors"
          :class="view === option ? 'bg-default font-medium text-default shadow-sm' : 'text-muted hover:text-default'"
          :data-mytasks-view="option"
          @click="setView(option)"
        >
          <UIcon
            :name="option === 'list' ? 'i-lucide-list' : 'i-lucide-layout-dashboard'"
            class="size-3.5"
          />
          {{ option }}
        </button>
      </div>
    </Teleport>

    <MyTasksBoard
      v-if="view === 'board'"
      class="min-h-0 flex-1"
      :tasks="mine"
      @open="open"
      @complete="updateTask($event.id, { completed: true })"
      @schedule="(id, dueOn) => updateTask(id, { dueOn })"
    />

    <nav
      v-if="view === 'list'"
      class="flex shrink-0 gap-1 border-b border-default px-4 lg:px-6"
    >
      <button
        v-for="name in TABS"
        :key="name"
        class="relative px-2.5 py-2 text-sm transition-colors"
        :class="tab === name ? 'font-medium text-default' : 'text-muted hover:text-default'"
        @click="tab = name"
      >
        {{ name === 'Overdue' && overdueCount ? `${name} (${overdueCount})` : name }}
        <span
          class="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary transition-opacity"
          :class="tab === name ? 'opacity-100' : 'opacity-0'"
        />
      </button>
    </nav>

    <div
      v-if="view === 'list'"
      class="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6"
    >
      <p
        v-if="ready && !shown.length"
        class="py-12 text-center text-sm text-muted"
      >
        Nothing in {{ tab.toLowerCase() }}.
      </p>
      <ul
        v-else
        class="overflow-hidden rounded-xl border border-default bg-default"
      >
        <li
          v-for="task in shown"
          :key="task.id"
          data-my-task
          class="flex cursor-pointer items-center gap-3 border-b border-default px-3 py-2 transition-colors last:border-b-0 hover:bg-elevated/60"
          @click="open(task)"
        >
          <button
            class="flex size-5 shrink-0 items-center justify-center rounded-full border transition-all"
            :class="task.completedAt != null
              ? 'border-success bg-success text-inverted'
              : 'border-accented text-transparent hover:border-success hover:text-success'"
            :aria-label="task.completedAt != null ? 'Mark incomplete' : 'Mark complete'"
            @click.stop="updateTask(task.id, { completed: task.completedAt == null })"
          >
            <UIcon
              name="i-lucide-check"
              class="size-3"
            />
          </button>
          <span
            class="min-w-0 flex-1 truncate text-sm"
            :class="task.completedAt != null ? 'text-dimmed line-through' : 'text-default'"
          >{{ task.title }}</span>
          <span class="hidden max-w-48 shrink-0 items-center gap-1.5 truncate rounded-md bg-elevated px-2 py-0.5 text-xs text-muted sm:flex">
            <span class="size-2 rounded-full bg-primary" />
            {{ task.projectName }}
          </span>
          <span
            class="w-16 shrink-0 text-right text-xs tabular-nums"
            :class="overdue(task) ? 'font-medium text-error' : 'text-dimmed'"
          >{{ task.dueOn ? format(dueDayToMs(task.dueOn), 'MMM d') : '' }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>
