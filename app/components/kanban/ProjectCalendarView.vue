<script setup lang="ts">
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday,
  startOfMonth, startOfWeek
} from 'date-fns'
import { calendarKeyDelta, movedDueOn } from '~/utils/calendarKeys'

const emit = defineEmits<{ openTask: [taskId: string] }>()

const { boardColumns, visibleColumnTasks, updateTask, isTrashed } = useProjects()

const cursor = ref(startOfMonth(new Date()))

const days = computed(() => eachDayOfInterval({
  start: startOfWeek(cursor.value, { weekStartsOn: 1 }),
  end: endOfWeek(endOfMonth(cursor.value), { weekStartsOn: 1 })
}))

const tasks = computed(() =>
  boardColumns.value
    .filter(column => !isTrashed(column))
    .flatMap(column => visibleColumnTasks(column.id))
    .filter(task => !isTrashed(task))
)

const undated = computed(() => tasks.value.filter(task => !task.dueOn))

function tasksOn(day: Date) {
  const iso = format(day, 'yyyy-MM-dd')
  return tasks.value.filter(task => task.dueOn === iso)
}

const weekdays = computed(() => days.value.slice(0, 7).map(day => format(day, 'EEE')))

async function dropOn(day: Date, event: DragEvent) {
  const id = event.dataTransfer?.getData('text/task-id')
  if (id) await updateTask(id, { dueOn: format(day, 'yyyy-MM-dd') })
}

function dragStart(taskId: string, event: DragEvent) {
  event.dataTransfer?.setData('text/task-id', taskId)
}

// The keyboard path for a task on a day: the arrow keys move its due day, as a drag of the same days would. Left and right
// a day, up and down a week (calendarKeys.ts). Any other key is left to the browser.
async function moveWithKeys(task: { id: string, dueOn?: string | null }, event: KeyboardEvent) {
  const delta = calendarKeyDelta(event.key)
  if (delta === null) return
  const next = movedDueOn(task.dueOn, delta)
  if (!next) return
  event.preventDefault()
  await updateTask(task.id, { dueOn: next })
}

const undatedOpen = ref(false)
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex shrink-0 items-center gap-2 px-4 py-2 lg:px-6">
      <UButton
        icon="i-lucide-chevron-left"
        size="xs"
        color="neutral"
        variant="ghost"
        aria-label="Previous month"
        @click="cursor = addMonths(cursor, -1)"
      />
      <UButton
        label="Today"
        size="xs"
        color="neutral"
        variant="soft"
        @click="cursor = startOfMonth(new Date())"
      />
      <UButton
        icon="i-lucide-chevron-right"
        size="xs"
        color="neutral"
        variant="ghost"
        aria-label="Next month"
        @click="cursor = addMonths(cursor, 1)"
      />
      <span class="ml-1 text-sm font-semibold text-default">{{ format(cursor, 'MMMM yyyy') }}</span>

      <UPopover
        v-model:open="undatedOpen"
        :content="{ align: 'end', sideOffset: 6 }"
      >
        <UButton
          :label="`No date (${undated.length})`"
          size="xs"
          color="neutral"
          variant="ghost"
          class="ml-auto"
        />
        <template #content>
          <div class="max-h-72 w-64 overflow-y-auto p-1.5">
            <p class="px-1.5 pb-1 text-xs text-dimmed">
              Drag onto a day to schedule.
            </p>
            <div
              v-for="task in undated"
              :key="task.id"
              draggable="true"
              class="cursor-grab truncate rounded-md px-1.5 py-1 text-xs text-default hover:bg-elevated"
              @dragstart="dragStart(task.id, $event)"
              @click="emit('openTask', task.id)"
            >
              {{ task.title }}
            </div>
          </div>
        </template>
      </UPopover>
    </div>

    <div class="grid shrink-0 grid-cols-7 border-y border-default px-4 lg:px-6">
      <div
        v-for="name in weekdays"
        :key="name"
        class="px-2 py-1.5 text-xs font-medium text-dimmed"
      >
        {{ name }}
      </div>
    </div>

    <div class="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 overflow-y-auto px-4 lg:px-6">
      <div
        v-for="day in days"
        :key="day.toISOString()"
        class="flex min-h-24 flex-col gap-1 border-b border-r border-default p-1.5 transition-colors [&:nth-child(7n+1)]:border-l"
        :class="isSameMonth(day, cursor) ? '' : 'bg-elevated/30'"
        @dragover.prevent
        @drop.prevent="dropOn(day, $event)"
      >
        <span
          class="flex size-6 items-center justify-center self-start rounded-full text-xs tabular-nums"
          :class="isToday(day) ? 'bg-primary font-semibold text-inverted' : isSameMonth(day, cursor) ? 'text-default' : 'text-dimmed'"
        >
          {{ format(day, 'd') }}
        </span>

        <button
          v-for="task in tasksOn(day).slice(0, 4)"
          :key="task.id"
          draggable="true"
          class="truncate rounded-md bg-primary/10 px-1.5 py-1 text-left text-xs text-default transition-colors hover:bg-primary/20"
          :class="task.completedAt ? 'line-through opacity-60' : ''"
          :aria-label="`${task.title}, due ${task.dueOn}. Arrow keys move it a day, up and down a week.`"
          @dragstart="dragStart(task.id, $event)"
          @keydown="moveWithKeys(task, $event)"
          @click="emit('openTask', task.id)"
        >
          {{ task.title }}
        </button>
        <span
          v-if="tasksOn(day).length > 4"
          class="px-1.5 text-[0.6875rem] text-dimmed"
        >
          +{{ tasksOn(day).length - 4 }} more
        </span>
      </div>
    </div>
  </div>
</template>
