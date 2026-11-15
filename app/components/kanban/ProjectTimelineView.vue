<script setup lang="ts">
import { addDays, differenceInCalendarDays, format, startOfDay, startOfWeek } from 'date-fns'
import { dueDayToMs } from '~/utils/dueDate'
import { errorMessage } from '~/utils/untypedFetch'
import { timelineKeyAction, timelineKeyHoldsArrow, type TimelineAction } from '~/utils/timelineKeys'
import { nudgePatch } from '~/utils/dateNudge'
import { TIMELINE_TAP_ITEMS, tapItemAction, type TimelineTapItem } from '~/utils/timelineTap'

const emit = defineEmits<{ openTask: [taskId: string] }>()

const { boardColumns, visibleColumnTasks, isTrashed, updateTask } = useProjects()
const toast = useToast()

const DAY_W = 28
const MIN_DAYS = 6 * 7

const sections = computed(() =>
  boardColumns.value
    .filter(column => !isTrashed(column))
    .map(column => ({
      column,
      tasks: visibleColumnTasks(column.id).filter(task => !isTrashed(task) && (task.dueOn || task.startOn))
    }))
    .filter(section => section.tasks.length)
)

const undatedCount = computed(() =>
  boardColumns.value
    .filter(column => !isTrashed(column))
    .flatMap(column => visibleColumnTasks(column.id))
    .filter(task => !isTrashed(task) && !task.dueOn && !task.startOn).length
)

const range = computed(() => {
  const today = startOfDay(new Date())
  const stamps = sections.value.flatMap(s => s.tasks.flatMap(t => [t.startOn, t.dueOn].filter((v): v is string => !!v).map(dueDayToMs)))
  const first = stamps.length ? new Date(Math.min(...stamps, today.getTime())) : today
  const last = stamps.length ? new Date(Math.max(...stamps, today.getTime())) : today
  const start = startOfWeek(addDays(first, -7), { weekStartsOn: 1 })
  const days = Math.max(MIN_DAYS, differenceInCalendarDays(last, start) + 14)
  return { start, days }
})

const weeks = computed(() =>
  Array.from({ length: Math.ceil(range.value.days / 7) }, (_, i) => addDays(range.value.start, i * 7))
)

const todayX = computed(() => differenceInCalendarDays(startOfDay(new Date()), range.value.start) * DAY_W + DAY_W / 2)

type DatedTask = { id: string, startOn?: string | null, dueOn?: string | null }

// A bar runs from the start date to the due date; a task with only one of them
// is a single day.
function span(task: DatedTask) {
  return {
    from: startOfDay(new Date(dueDayToMs((task.startOn ?? task.dueOn)!))),
    to: startOfDay(new Date(dueDayToMs((task.dueOn ?? task.startOn)!)))
  }
}

// ─── Dragging ───────────────────────────────────────────────
// The body of a bar moves the task, its two edges change the start or the due
// date. Everything snaps to whole days. The bar follows the pointer while it is
// held and the dates are saved once, when it is let go.

type DragMode = 'move' | 'start' | 'end'

const drag = ref<{ id: string, mode: DragMode, originX: number, delta: number, moved: boolean } | null>(null)
// A drag ends in a click on the bar; that click must not open the task.
let justDragged = false

// The task's span after a drag of `delta` days. An edge stops at the other one,
// so a bar can shrink to a single day but never turn inside out.
function shifted(task: DatedTask, mode: DragMode, delta: number) {
  const { from, to } = span(task)
  if (mode === 'move') return { from: addDays(from, delta), to: addDays(to, delta) }
  if (mode === 'start') {
    const moved = addDays(from, delta)
    return { from: moved > to ? to : moved, to }
  }
  const moved = addDays(to, delta)
  return { from, to: moved < from ? from : moved }
}

// The span the bar is drawn with: the task's own, or where an unfinished drag has it.
function liveSpan(task: DatedTask) {
  const current = drag.value
  return current?.id === task.id ? shifted(task, current.mode, current.delta) : span(task)
}

function bar(task: DatedTask) {
  const { from, to } = liveSpan(task)
  const left = differenceInCalendarDays(from, range.value.start) * DAY_W
  const width = (Math.max(0, differenceInCalendarDays(to, from)) + 1) * DAY_W
  return { left: `${left + 2}px`, width: `${width - 4}px` }
}

function dragLabel(task: DatedTask) {
  const { from, to } = liveSpan(task)
  return differenceInCalendarDays(to, from) ? `${format(from, 'MMM d')} – ${format(to, 'MMM d')}` : format(from, 'MMM d')
}

function onDragStart(event: PointerEvent, task: DatedTask, mode: DragMode) {
  // A finger on a bar is a scroll or a tap, as it always was.
  if (event.button !== 0 || event.pointerType === 'touch') return
  event.stopPropagation()
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  drag.value = { id: task.id, mode, originX: event.clientX, delta: 0, moved: false }
}

function onDragMove(event: PointerEvent) {
  const current = drag.value
  if (!current) return
  const dx = event.clientX - current.originX
  if (Math.abs(dx) > 3) current.moved = true
  current.delta = Math.round(dx / DAY_W)
}

async function onDragEnd(task: DatedTask) {
  const current = drag.value
  drag.value = null
  if (!current?.moved) return
  justDragged = true
  setTimeout(() => {
    justDragged = false
  }, 0)
  if (!current.delta) return

  const iso = (date: Date) => format(date, 'yyyy-MM-dd')
  const { from, to } = shifted(task, current.mode, current.delta)

  const patch: { startOn?: string, dueOn?: string } = {}
  if (current.mode === 'move') {
    if (task.startOn) patch.startOn = iso(from)
    if (task.dueOn) patch.dueOn = iso(to)
  } else if (current.mode === 'start') {
    patch.startOn = iso(from)
  } else {
    patch.dueOn = iso(to)
  }

  try {
    await updateTask(task.id, patch)
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not change the dates'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

function onBarClick(task: DatedTask) {
  if (!justDragged) emit('openTask', task.id)
}

// The tap path: a row's Move-the-bar menu gives the same four moves as the keys (timelineTap.ts), through the same date rule.
function barMenuItems(task: DatedTask) {
  return [TIMELINE_TAP_ITEMS.map(item => ({ label: item.label, onSelect: () => tapBar(task, item.id) }))]
}

async function tapBar(task: DatedTask, id: TimelineTapItem['id']) {
  const action = tapItemAction(id)
  await applyBarAction(task, action)
}

// The keyboard path for a focused bar: a plain arrow moves it a day, Shift changes its end, Alt its start (timelineKeys.ts).
// The dates come from the same rule the drag uses (dateNudge.ts), so a key move lands where a drag would.
// Left and Right are the bar's even with Alt, so the browser's Back and Forward do not run while the bar has focus.
async function onBarKey(task: DatedTask, event: KeyboardEvent) {
  if (timelineKeyHoldsArrow(event.key)) event.preventDefault()
  const action = timelineKeyAction(event.key, { shift: event.shiftKey, alt: event.altKey })
  if (!action) return
  await applyBarAction(task, action)
}

// The one save for a key or a tap: the date rule gives the dates, and a failed save says so.
async function applyBarAction(task: DatedTask, action: TimelineAction) {
  const patch = nudgePatch(task, action.mode, action.delta)
  if (!Object.keys(patch).length) return
  try {
    await updateTask(task.id, patch)
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not change the dates'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

const scroller = ref<HTMLElement | null>(null)

function scrollToToday() {
  scroller.value?.scrollTo({ left: Math.max(0, todayX.value - 80) })
}

onMounted(() => requestAnimationFrame(scrollToToday))
watch(() => sections.value.length, () => nextTick(scrollToToday), { once: true })
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <p
      v-if="undatedCount"
      class="shrink-0 px-4 py-2 text-xs text-dimmed lg:px-6"
    >
      {{ undatedCount }} {{ undatedCount === 1 ? 'task has' : 'tasks have' }} no dates and {{ undatedCount === 1 ? 'is' : 'are' }} not shown.
    </p>

    <div
      v-if="!sections.length"
      class="flex flex-1 flex-col items-center justify-center gap-2 text-center"
    >
      <UIcon
        name="i-lucide-gantt-chart"
        class="size-6 text-dimmed"
      />
      <p class="text-sm text-muted">
        Give tasks a start or due date to see them on the timeline.
      </p>
    </div>

    <div
      v-else
      ref="scroller"
      class="min-h-0 flex-1 overflow-auto"
      data-timeline
    >
      <div
        class="relative"
        :style="{ width: `${range.days * DAY_W + 192}px` }"
      >
        <div class="sticky top-0 z-20 flex border-b border-default bg-default">
          <div class="sticky left-0 z-10 w-48 shrink-0 border-r border-default bg-default" />
          <div
            v-for="week in weeks"
            :key="week.toISOString()"
            class="shrink-0 border-r border-default px-2 py-1.5 text-xs text-dimmed"
            :style="{ width: `${7 * DAY_W}px` }"
          >
            {{ format(week, 'MMM d') }}
          </div>
        </div>

        <div
          class="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-primary/60"
          :style="{ left: `${192 + todayX}px` }"
        />

        <template
          v-for="section in sections"
          :key="section.column.id"
        >
          <div class="flex border-b border-default bg-elevated/40">
            <div class="sticky left-0 z-10 w-48 shrink-0 border-r border-default bg-elevated px-3 py-1.5 text-xs font-semibold text-default">
              {{ section.column.name }}
            </div>
          </div>
          <div
            v-for="task in section.tasks"
            :key="task.id"
            class="flex h-9 border-b border-default"
          >
            <div class="sticky left-0 z-10 flex w-48 shrink-0 items-center gap-1 border-r border-default bg-default pr-1 transition-colors hover:bg-elevated">
              <button
                class="min-w-0 flex-1 truncate px-3 text-left text-sm text-default"
                @click="emit('openTask', task.id)"
              >
                {{ task.title }}
              </button>
              <UDropdownMenu
                :items="barMenuItems(task)"
                :content="{ align: 'end' }"
              >
                <UButton
                  icon="i-lucide-move-horizontal"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  aria-label="Move the bar"
                />
              </UDropdownMenu>
            </div>
            <div class="relative flex-1">
              <button
                class="group absolute top-1.5 h-6 select-none rounded-md px-2 text-left text-xs"
                :class="[
                  task.completedAt ? 'bg-success/25 text-default' : 'bg-primary/80 text-inverted hover:bg-primary',
                  drag?.id === task.id ? 'z-10 cursor-grabbing shadow-md ring-2 ring-primary/40' : 'cursor-grab transition-colors'
                ]"
                :style="bar(task)"
                data-timeline-bar
                :title="task.title"
                :aria-label="`${task.title}. Arrow keys move it a day; Shift and an arrow change its end; Alt and an arrow change its start.`"
                @keydown="onBarKey(task, $event)"
                @pointerdown="onDragStart($event, task, 'move')"
                @pointermove="onDragMove"
                @pointerup="onDragEnd(task)"
                @pointercancel="drag = null"
                @click="onBarClick(task)"
              >
                <span class="block truncate">{{ task.title }}</span>
                <span
                  class="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-md opacity-0 transition-opacity group-hover:bg-black/20 group-hover:opacity-100"
                  data-timeline-handle="start"
                  @pointerdown="onDragStart($event, task, 'start')"
                  @pointermove.stop="onDragMove"
                  @pointerup.stop="onDragEnd(task)"
                  @click.stop
                />
                <span
                  class="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-md opacity-0 transition-opacity group-hover:bg-black/20 group-hover:opacity-100"
                  data-timeline-handle="end"
                  @pointerdown="onDragStart($event, task, 'end')"
                  @pointermove.stop="onDragMove"
                  @pointerup.stop="onDragEnd(task)"
                  @click.stop
                />
                <span
                  v-if="drag?.id === task.id && drag.moved"
                  class="pointer-events-none absolute -top-6 left-0 whitespace-nowrap rounded-md border border-default bg-default px-1.5 py-0.5 text-[0.625rem] font-medium tabular-nums text-default shadow-md"
                  data-timeline-label
                >{{ dragLabel(task) }}</span>
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
