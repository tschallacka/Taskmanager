<script setup lang="ts">
// The extra cells of a List row, each edited in place: the assignee from a menu, the due date from a date input, the
// labels from a text field. The same cells draw in two layouts: as the table's columns on a wide screen, and folded
// under the title on a phone (the parent decides which layout shows where).
import { format } from 'date-fns'
import { dueDayToMs, isOverdueDay, todayIso } from '~/utils/dueDate'
import { boardPeople, type ProjectTask } from '~/composables/useProjects'
import { errorMessage } from '~/utils/untypedFetch'
import { parseDuration } from '#shared/utils/duration'

const props = defineProps<{
  task: ProjectTask
  shown: { assignee: boolean, due: boolean, labels: boolean, time: boolean }
  layout: 'column' | 'fold'
  // The minutes logged on this task so far, from everyone on the team.
  minutes: number
}>()

const emit = defineEmits<{ logged: [taskId: string, minutes: number] }>()

const { personById, updateTask } = useProjects()
const toast = useToast()

// "1h 30m", "45m" or "2h" for display.
function formatMinutes(minutes: number) {
  if (!minutes) return ''
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest}m`
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

// The time cell logs time in place: a typed duration is saved as a time entry on the task, then the total moves.
const editingTime = ref(false)
const timeDraft = ref('')

function startTime() {
  timeDraft.value = ''
  editingTime.value = true
}

async function commitTime() {
  if (!editingTime.value) return
  editingTime.value = false
  const text = timeDraft.value.trim()
  if (!text) return
  const minutes = parseDuration(text)
  if (minutes === null) {
    toast.add({ title: 'Time is written like 1h 30m, 1:30 or 45m', color: 'error' })
    return
  }
  try {
    await $fetch(`/api/tasks/${props.task.id}/time`, { method: 'POST', headers: realtimeHeaders(), body: { minutes } })
    emit('logged', props.task.id, minutes)
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not log the time'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

async function saveCell(patch: { assigneeId?: string | null, dueOn?: string | null, tags?: string[] }, failed: string) {
  try {
    await updateTask(props.task.id, patch)
  } catch (e) {
    toast.add({ title: errorMessage(e, failed), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

function setDue(value: string) {
  return saveCell({ dueOn: value || null }, 'Could not save the due date')
}

const assignItems = computed(() => [
  [{ label: 'Unassigned', icon: 'i-lucide-user-x', onSelect: () => saveCell({ assigneeId: null }, 'Could not change the assignee') }],
  boardPeople().map(person => ({
    label: person.kind === 'customer' ? `${person.name || person.email || ''} (customer)` : person.name || person.email || '',
    avatar: { src: person.image ?? undefined, alt: person.name || person.email || '' },
    onSelect: () => saveCell({ assigneeId: person.id }, 'Could not change the assignee')
  }))
])

function dueLabel(day: string) {
  const today = todayIso()
  if (day === today) return 'Today'
  if (dueDayToMs(day) - dueDayToMs(today) === 86400000) return 'Tomorrow'
  return format(dueDayToMs(day), 'MMM d')
}

const overdue = computed(() => !!props.task.dueOn && !props.task.completedAt && isOverdueDay(props.task.dueOn))

// The labels cell edits as one comma-separated field: blank entries and repeats are dropped when it saves.
const editingLabels = ref(false)
const labelDraft = ref('')

function startLabels() {
  labelDraft.value = props.task.tags.join(', ')
  editingLabels.value = true
}

function commitLabels() {
  if (!editingLabels.value) return
  editingLabels.value = false
  const tags = [...new Set(labelDraft.value.split(',').map(tag => tag.trim()).filter(Boolean))]
  if (tags.join('\n') === props.task.tags.join('\n')) return
  saveCell({ tags }, 'Could not save the labels')
}

function cancelLabels() {
  editingLabels.value = false
}
</script>

<template>
  <div
    class="flex min-w-0 items-center gap-2"
    :class="layout === 'fold' ? 'flex-wrap text-xs text-dimmed' : 'shrink-0'"
  >
    <span
      v-if="shown.assignee"
      class="flex shrink-0 items-center"
      :class="layout === 'column' ? 'w-28 min-w-0' : ''"
      @click.stop
    >
      <UDropdownMenu
        :items="assignItems"
        :content="{ align: 'end', collisionPadding: 12 }"
      >
        <button
          class="flex items-center gap-1 rounded-full ring-primary transition-shadow hover:ring-1 focus-visible:ring-1"
          :aria-label="personById(task.assigneeId) ? `Assignee: ${personById(task.assigneeId)!.name || personById(task.assigneeId)!.email || ''}. Change it` : 'Unassigned. Assign someone'"
          data-list-assign
        >
          <UAvatar
            v-if="personById(task.assigneeId)"
            :src="personById(task.assigneeId)!.image ?? undefined"
            :alt="personById(task.assigneeId)!.name || personById(task.assigneeId)!.email || ''"
            size="2xs"
            data-list-assignee
          />
          <UIcon
            v-else
            name="i-lucide-user-plus"
            class="size-4 text-dimmed"
          />
          <span
            v-if="personById(task.assigneeId)"
            class="truncate"
          >{{ personById(task.assigneeId)!.name || personById(task.assigneeId)!.email }}</span>
        </button>
      </UDropdownMenu>
    </span>

    <span
      v-if="shown.due"
      class="shrink-0"
      :class="layout === 'column' ? 'block w-28 text-right tabular-nums' : 'tabular-nums'"
      @click.stop
    >
      <input
        type="date"
        min="2000-01-01"
        max="2999-12-31"
        :value="task.dueOn ?? ''"
        :aria-label="task.dueOn ? `Due ${dueLabel(task.dueOn)}. Change the date` : 'No due date. Pick one'"
        class="w-full rounded bg-transparent px-1 py-0.5 text-xs tabular-nums outline-none transition-colors hover:bg-elevated focus:ring-1 focus:ring-primary"
        :class="[
          layout === 'column' ? 'text-right' : '',
          overdue ? 'text-error' : task.dueOn ? 'text-default' : 'text-dimmed'
        ]"
        data-list-due
        @change="setDue(($event.target as HTMLInputElement).value)"
      >
    </span>

    <span
      v-if="shown.labels"
      class="flex min-w-0 items-center gap-1"
      :class="layout === 'column' ? 'w-40 justify-end' : ''"
      @click.stop
    >
      <input
        v-if="editingLabels"
        v-model="labelDraft"
        data-list-labels-input
        placeholder="Labels, comma separated"
        class="w-full min-w-0 rounded bg-default px-1.5 py-0.5 text-xs text-default outline-none ring-1 ring-primary"
        @keydown.enter.prevent="commitLabels"
        @keydown.escape="cancelLabels"
        @blur="commitLabels"
      >
      <button
        v-else
        class="flex min-w-0 items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-elevated"
        :aria-label="task.tags.length ? `Labels: ${task.tags.join(', ')}. Change them` : 'No labels. Add some'"
        data-list-labels
        @click.stop="startLabels"
      >
        <KanbanLabelChip
          v-for="tag in task.tags.slice(0, layout === 'column' ? 2 : 4)"
          :key="tag"
          :tag="tag"
          chip-class="text-[0.6875rem]"
        />
        <span
          v-if="!task.tags.length"
          class="text-dimmed"
        >No labels</span>
      </button>
    </span>

    <!-- The time cell comes after the labels, as the design's List has it: Task, Assignee, Due, Labels, Time. -->
    <span
      v-if="shown.time"
      class="shrink-0 tabular-nums"
      :class="layout === 'column' ? 'block w-16 text-right' : ''"
      @click.stop
    >
      <input
        v-if="editingTime"
        v-model="timeDraft"
        data-list-time-input
        placeholder="1h 30m"
        class="w-20 rounded bg-default px-1.5 py-0.5 text-xs text-default outline-none ring-1 ring-primary"
        @keydown.enter.prevent="commitTime"
        @keydown.escape="editingTime = false"
        @blur="commitTime"
      >
      <button
        v-else
        class="rounded px-1 py-0.5 text-xs transition-colors hover:bg-elevated"
        :class="minutes ? 'text-default' : 'text-dimmed'"
        :aria-label="minutes ? `Time logged: ${formatMinutes(minutes)}. Log more` : 'No time logged. Log some'"
        data-list-time
        @click.stop="startTime"
      >
        {{ minutes ? formatMinutes(minutes) : '+ time' }}
      </button>
    </span>
  </div>
</template>
