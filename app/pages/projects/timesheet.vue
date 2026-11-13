<script setup lang="ts">
import { format } from 'date-fns'
import { formatDuration, parseDuration } from '#shared/utils/duration'
import { dueDayToMs, todayIso } from '~/utils/dueDate'
import { errorMessage, untypedFetch } from '~/utils/untypedFetch'
import type { TimeEntry } from '~/composables/useTimeTracking'

definePageMeta({ layout: 'app' })

useSeoMeta({ title: 'Timesheet' })

const { allTasks, projects } = useProjects()
const { session } = useAuth()
const toast = useToast()
const { revision } = useRunningTimer()

// ─── The week ───────────────────────────────────────────────

const week = useWeek()
const entries = ref<TimeEntry[]>([])
let latest = 0

async function load() {
  const mine = ++latest
  try {
    const rows = await untypedFetch<TimeEntry[]>('/api/time', { query: { from: week.from.value, to: week.to.value } })
    if (mine === latest) entries.value = rows
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not load the timesheet'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

watch(week.from, load, { immediate: true })
// A timer stopped from the sidebar has logged an entry.
watch(revision, load)
// Time logged on any project, from here or by an agent.
useResourceListener('time', () => load())

const total = computed(() => entries.value.reduce((sum, entry) => sum + entry.minutes, 0))

const byDay = computed(() => {
  const groups = new Map<string, TimeEntry[]>()
  for (const entry of entries.value) groups.set(entry.day, [...(groups.get(entry.day) ?? []), entry])
  return [...groups].sort((a, b) => b[0].localeCompare(a[0]))
})

function dayLabel(day: string) {
  return day === todayIso() ? 'Today' : format(dueDayToMs(day), 'EEEE, MMM d')
}

// ─── Adding time ────────────────────────────────────────────

// Only on projects the person works on as staff: a contact of a customer has no
// time to log there.
const taskGroups = computed(() => {
  const staffProjects = new Set(projects.value.filter(project => project.audience !== 'customer').map(project => project.id))
  const groups = new Map<string, { name: string, tasks: { id: string, title: string }[] }>()
  for (const task of allTasks.value) {
    if (task.completedAt != null || !staffProjects.has(task.projectId)) continue
    const group = groups.get(task.projectId) ?? { name: task.projectName, tasks: [] }
    group.tasks.push({ id: task.id, title: task.title })
    groups.set(task.projectId, group)
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
})

const taskId = ref('')
const duration = ref('')
const day = ref(todayIso())
const note = ref('')
const error = ref('')
const adding = ref(false)

async function add() {
  error.value = ''
  const minutes = parseDuration(duration.value)
  if (!taskId.value) {
    error.value = 'Pick the task the time was spent on'
    return
  }
  if (minutes === null) {
    error.value = 'Write the time like 1h 30m, 1:30 or 45m'
    return
  }
  adding.value = true
  try {
    await untypedFetch(`/api/tasks/${taskId.value}/time`, { method: 'POST', body: { minutes, day: day.value || todayIso(), note: note.value } })
    duration.value = ''
    note.value = ''
    await load()
  } catch (e) {
    error.value = errorMessage(e, 'Could not log the time')
  } finally {
    adding.value = false
  }
}

async function removeEntry(id: string) {
  try {
    await untypedFetch(`/api/time/${id}`, { method: 'DELETE' })
    entries.value = entries.value.filter(entry => entry.id !== id)
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not delete the entry'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}
</script>

<template>
  <div class="flex min-w-0 flex-1 flex-col">
    <Teleport
      defer
      to="#app-topbar-title"
    >
      <h1 class="flex items-center gap-1.5 text-base font-semibold text-default">
        Timesheet
        <HelpHint page="workspace/timesheet">
          The time you and your team logged, by day and project. How to start a timer or log time by hand is in the help.
        </HelpHint>
      </h1>
    </Teleport>

    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <UButton
          icon="i-lucide-chevron-left"
          size="xs"
          color="neutral"
          variant="soft"
          aria-label="Previous week"
          data-week-prev
          @click="week.shift(-1)"
        />
        <UButton
          icon="i-lucide-chevron-right"
          size="xs"
          color="neutral"
          variant="soft"
          aria-label="Next week"
          data-week-next
          @click="week.shift(1)"
        />
        <h2
          class="text-sm font-semibold text-default"
          data-week-label
        >
          {{ week.label.value }}
        </h2>
        <UButton
          v-if="!week.isCurrent.value"
          label="This week"
          size="xs"
          color="neutral"
          variant="ghost"
          @click="week.reset()"
        />
        <span class="ml-auto text-sm text-muted">
          <span
            class="font-semibold tabular-nums text-default"
            data-week-total
          >{{ formatDuration(total) }}</span> this week
        </span>
      </div>

      <TimeGrid
        :entries="entries"
        :days="week.days.value"
        by="task"
      />

      <form
        class="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-default bg-default p-3"
        data-ts-form
        @submit.prevent="add"
      >
        <select
          v-model="taskId"
          class="min-w-48 flex-1 rounded-md border border-default bg-transparent px-2 py-1.5 text-sm text-default outline-none focus:border-primary"
          data-ts-task
        >
          <option value="">
            Pick a task…
          </option>
          <optgroup
            v-for="group in taskGroups"
            :key="group.name"
            :label="group.name"
          >
            <option
              v-for="task in group.tasks"
              :key="task.id"
              :value="task.id"
            >
              {{ task.title }}
            </option>
          </optgroup>
        </select>
        <input
          v-model="duration"
          type="text"
          placeholder="1h 30m"
          class="w-24 rounded-md border border-default bg-transparent px-2 py-1.5 text-sm tabular-nums outline-none placeholder:text-dimmed focus:border-primary"
          data-ts-duration
        >
        <input
          v-model="day"
          type="date"
          min="2000-01-01"
          max="2999-12-31"
          class="rounded-md border border-default bg-transparent px-2 py-1.5 text-sm outline-none focus:border-primary"
          data-ts-day
        >
        <input
          v-model="note"
          type="text"
          maxlength="500"
          placeholder="What was it?"
          class="min-w-32 flex-1 rounded-md border border-default bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-dimmed focus:border-primary"
          data-ts-note
        >
        <UButton
          type="submit"
          label="Add time"
          size="sm"
          :loading="adding"
          data-ts-add
        />
        <p
          v-if="error"
          class="w-full text-xs text-error"
          data-ts-error
        >
          {{ error }}
        </p>
      </form>

      <section
        v-for="[entryDay, dayEntries] in byDay"
        :key="entryDay"
        class="mt-5"
        data-ts-day-group
      >
        <h3 class="mb-1 flex items-baseline gap-2 text-sm font-semibold text-default">
          {{ dayLabel(entryDay) }}
          <span class="text-xs font-normal tabular-nums text-dimmed">{{ formatDuration(dayEntries.reduce((sum, entry) => sum + entry.minutes, 0)) }}</span>
        </h3>
        <ul class="overflow-hidden rounded-xl border border-default bg-default">
          <li
            v-for="entry in dayEntries"
            :key="entry.id"
            class="group flex items-center gap-3 border-b border-default px-3 py-2 text-sm last:border-b-0"
            data-ts-entry
          >
            <span class="w-16 shrink-0 font-medium tabular-nums text-default">{{ formatDuration(entry.minutes) }}</span>
            <span class="min-w-0 flex-1 truncate text-default">{{ entry.taskTitle }}</span>
            <span class="hidden max-w-40 shrink-0 truncate rounded-md bg-elevated px-2 py-0.5 text-xs text-muted sm:block">{{ entry.projectName }}</span>
            <span class="hidden min-w-0 max-w-56 flex-1 truncate text-xs text-dimmed md:block">{{ entry.note }}</span>
            <button
              v-if="entry.author.id === session?.user.id"
              class="shrink-0 text-dimmed opacity-0 transition-opacity hover:text-error focus:opacity-100 group-hover:opacity-100"
              aria-label="Delete entry"
              data-ts-delete
              @click="removeEntry(entry.id)"
            >
              <UIcon
                name="i-lucide-trash-2"
                class="size-4"
              />
            </button>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
