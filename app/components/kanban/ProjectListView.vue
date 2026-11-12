<script setup lang="ts">
import { format } from 'date-fns'
import { columnDotAttrs } from '~/utils/tagColors'
import { dueDayToMs, isOverdueDay, todayIso } from '~/utils/dueDate'
import type { ProjectTask } from '~/composables/useProjects'
import { errorMessage } from '~/utils/untypedFetch'

const emit = defineEmits<{ openTask: [taskId: string] }>()

const { boardColumns, visibleColumnTasks, subtasksOf, personById, updateTask, isTrashed, activeProjectId } = useProjects()

// A column per custom field, each cell editable in place.
const toast = useToast()
const { fields, valueOf, setValues } = useCustomFields(activeProjectId)

const FIELD_WIDTH: Record<string, string> = { select: 'w-28', number: 'w-20', date: 'w-28', text: 'w-32' }

async function setField(taskId: string, fieldId: string, value: string | null) {
  try {
    await setValues(taskId, { [fieldId]: value })
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not save the field'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

const collapsed = ref(new Set<string>())

// Group and sort are chosen in the header and remembered per board in this browser (the choice is a view setting, not
// board data, so it is not sent to the server).
type GroupBy = 'column' | 'assignee'
type SortBy = 'due' | 'title'
const groupBy = ref<GroupBy>('column')
const sortBy = ref<SortBy>('due')
const VIEW_KEY = (boardId: string | null) => `tm-list-view:${boardId ?? ''}`

// The optional columns of each row. Chosen once per board and remembered; the default shows all three.
type OptionalColumn = 'assignee' | 'due' | 'labels'
const OPTIONAL_COLUMNS: { id: OptionalColumn, label: string }[] = [
  { id: 'assignee', label: 'Assignee' },
  { id: 'due', label: 'Due' },
  { id: 'labels', label: 'Labels' }
]
const shownColumns = ref<Record<OptionalColumn, boolean>>({ assignee: true, due: true, labels: true })

function loadView() {
  try {
    const raw = JSON.parse(localStorage.getItem(VIEW_KEY(activeProjectId.value)) ?? 'null')
    if (raw?.groupBy === 'column' || raw?.groupBy === 'assignee') groupBy.value = raw.groupBy
    if (raw?.sortBy === 'due' || raw?.sortBy === 'title') sortBy.value = raw.sortBy
    const cols = raw?.columns
    if (cols && typeof cols === 'object') {
      for (const col of OPTIONAL_COLUMNS) if (typeof cols[col.id] === 'boolean') shownColumns.value[col.id] = cols[col.id]
    }
  } catch { /* no storage here: the defaults stand */ }
}

function saveView() {
  try {
    localStorage.setItem(VIEW_KEY(activeProjectId.value), JSON.stringify({
      groupBy: groupBy.value,
      sortBy: sortBy.value,
      columns: shownColumns.value
    }))
  } catch { /* the choice lasts this visit */ }
}

onMounted(loadView)
watch(activeProjectId, loadView)
watch([groupBy, sortBy, shownColumns], saveView, { deep: true })

/** Tasks in the chosen order: by due day (none last) or by title. */
function sorted(tasks: ProjectTask[]): ProjectTask[] {
  const copy = [...tasks]
  if (sortBy.value === 'title') return copy.sort((a, b) => a.title.localeCompare(b.title))
  // A task with no due day sorts after every dated one.
  return copy.sort((a, b) => {
    if (!a.dueOn || !b.dueOn) return a.dueOn ? -1 : b.dueOn ? 1 : 0
    return a.dueOn.localeCompare(b.dueOn)
  })
}

const sections = computed(() => {
  if (groupBy.value === 'assignee') {
    // One section per person who has tasks, then the unassigned. Tasks come from every column.
    const all = boardColumns.value.filter(column => !isTrashed(column)).flatMap(column => visibleColumnTasks(column.id))
      .filter(task => !isTrashed(task))
    const people = new Map<string, { id: string, label: string, tasks: ProjectTask[] }>()
    for (const task of all) {
      const key = task.assigneeId ?? ''
      const person = task.assigneeId ? personById(task.assigneeId) : undefined
      const label = person ? (person.name || person.email || 'Someone') : 'Unassigned'
      if (!people.has(key)) people.set(key, { id: `person:${key}`, label, tasks: [] })
      people.get(key)!.tasks.push(task)
    }
    return [...people.values()]
      .sort((a, b) => (a.id === 'person:' ? 1 : b.id === 'person:' ? -1 : a.label.localeCompare(b.label)))
      .map(group => ({ id: group.id, name: group.label, tasks: sorted(group.tasks) }))
  }
  return boardColumns.value
    .filter(column => !isTrashed(column))
    .map(column => ({
      id: column.id,
      name: column.name,
      column,
      tasks: sorted(visibleColumnTasks(column.id).filter(task => !isTrashed(task)))
    }))
})

function toggleSection(id: string) {
  const next = new Set(collapsed.value)
  if (!next.delete(id)) next.add(id)
  collapsed.value = next
}

function dueLabel(day: string) {
  const today = todayIso()
  if (day === today) return 'Today'
  if (dueDayToMs(day) - dueDayToMs(today) === 86400000) return 'Tomorrow'
  return format(dueDayToMs(day), 'MMM d')
}

function overdue(task: ProjectTask) {
  return !!task.dueOn && !task.completedAt && isOverdueDay(task.dueOn)
}

function allSubtasks(taskId: string): ProjectTask[] {
  return subtasksOf(taskId).flatMap(sub => [sub, ...allSubtasks(sub.id)])
}

function subtaskProgress(taskId: string) {
  const all = allSubtasks(taskId)
  return { total: all.length, done: all.filter(sub => sub.completedAt != null).length }
}
</script>

<template>
  <div class="h-full overflow-y-auto px-4 pb-10 lg:px-6">
    <div
      v-if="fields.length"
      class="mt-3 hidden items-center gap-3 px-3 text-[0.6875rem] font-medium uppercase tracking-wide text-dimmed md:flex"
      data-list-header
    >
      <span class="flex-1" />
      <span
        v-for="field in fields"
        :key="field.id"
        class="shrink-0 truncate px-1"
        :class="FIELD_WIDTH[field.type]"
      >{{ field.name }}</span>
      <span class="w-[6.75rem] shrink-0" />
    </div>
    <div
      class="mt-3 flex flex-wrap items-center gap-3 px-1"
      data-list-controls
    >
      <label class="flex items-center gap-1.5 text-xs text-muted">
        Group by
        <select
          v-model="groupBy"
          class="rounded-md border border-default bg-default px-2 py-1 text-xs text-default"
          data-list-group
        >
          <option value="column">Column</option>
          <option value="assignee">Assignee</option>
        </select>
      </label>
      <div
        class="flex items-center gap-1 text-xs text-muted"
        role="group"
        aria-label="Columns"
      >
        <span>Columns</span>
        <button
          v-for="col in OPTIONAL_COLUMNS"
          :key="col.id"
          class="rounded-md border px-2 py-0.5 transition-colors"
          :class="shownColumns[col.id] ? 'border-primary bg-primary/10 text-default' : 'border-default text-muted'"
          :aria-pressed="shownColumns[col.id]"
          :data-list-column-toggle="col.id"
          @click="shownColumns[col.id] = !shownColumns[col.id]"
        >
          {{ col.label }}
        </button>
      </div>
      <label class="flex items-center gap-1.5 text-xs text-muted">
        Sort
        <select
          v-model="sortBy"
          class="rounded-md border border-default bg-default px-2 py-1 text-xs text-default"
          data-list-sort
        >
          <option value="due">Due date</option>
          <option value="title">Title</option>
        </select>
      </label>
    </div>
    <div
      v-for="section in sections"
      :key="section.id"
      class="mt-4"
    >
      <button
        class="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-elevated"
        @click="toggleSection(section.id)"
      >
        <UIcon
          name="i-lucide-chevron-down"
          class="size-4 text-dimmed transition-transform duration-200"
          :class="collapsed.has(section.id) ? '-rotate-90' : ''"
        />
        <span
          v-if="groupBy === 'column' && section.column"
          class="size-2 rounded-full"
          :class="columnDotAttrs(section.column).class"
          :style="columnDotAttrs(section.column).style"
        />
        <span class="text-sm font-semibold text-default">{{ section.name }}</span>
        <span class="text-xs tabular-nums text-dimmed">{{ section.tasks.length }}</span>
      </button>

      <Transition name="list-fold">
        <ul
          v-if="!collapsed.has(section.id)"
          class="mt-1 overflow-hidden rounded-xl border border-default bg-default"
        >
          <li
            v-for="task in section.tasks"
            :key="task.id"
            data-list-row
            class="group flex cursor-pointer items-center gap-3 border-b border-default px-3 py-2 transition-colors last:border-b-0 hover:bg-elevated/60"
            @click="emit('openTask', task.id)"
          >
            <button
              class="flex size-5 shrink-0 items-center justify-center rounded-full border transition-all"
              :class="task.completedAt
                ? 'border-success bg-success text-inverted'
                : 'border-accented text-transparent hover:border-success hover:text-success'"
              :aria-label="task.completedAt ? 'Mark incomplete' : 'Mark complete'"
              @click.stop="updateTask(task.id, { completed: !task.completedAt })"
            >
              <UIcon
                name="i-lucide-check"
                class="size-3"
              />
            </button>

            <span
              class="min-w-0 flex-1 truncate text-sm"
              :class="task.completedAt ? 'text-dimmed line-through' : 'text-default'"
            >
              {{ task.title }}
            </span>

            <span
              v-if="subtaskProgress(task.id).total"
              class="flex shrink-0 items-center gap-1 text-xs tabular-nums text-dimmed"
              data-subtask-count
            >
              <UIcon
                name="i-lucide-list-tree"
                class="size-3"
              />
              {{ subtaskProgress(task.id).done }}/{{ subtaskProgress(task.id).total }}
            </span>

            <span
              v-if="shownColumns.labels"
              class="hidden shrink-0 items-center gap-1 sm:flex"
            >
              <KanbanLabelChip
                v-for="tag in task.tags.slice(0, 2)"
                :key="tag"
                :tag="tag"
                chip-class="text-[0.6875rem]"
              />
            </span>

            <span
              v-for="field in fields"
              :key="field.id"
              class="hidden shrink-0 md:block"
              :class="FIELD_WIDTH[field.type]"
              :data-list-field="field.name"
            >
              <KanbanFieldInput
                :field="field"
                :value="valueOf(task.id, field.id)"
                @change="setField(task.id, field.id, $event)"
              />
            </span>

            <span
              v-if="shownColumns.assignee"
              class="flex w-5 shrink-0 justify-center"
            >
              <UAvatar
                v-if="personById(task.assigneeId)"
                :src="personById(task.assigneeId)!.image ?? undefined"
                :alt="personById(task.assigneeId)!.name || personById(task.assigneeId)!.email || ''"
                :title="personById(task.assigneeId)!.name || personById(task.assigneeId)!.email || ''"
                size="2xs"
                data-list-assignee
              />
            </span>

            <span
              v-if="shownColumns.due"
              class="w-16 shrink-0 text-right text-xs tabular-nums"
              :class="overdue(task) ? 'font-medium text-error' : 'text-dimmed'"
            >
              {{ task.dueOn ? dueLabel(task.dueOn) : '' }}
            </span>
          </li>

          <li
            v-if="!section.tasks.length"
            class="px-3 py-3 text-xs text-dimmed"
          >
            Nothing here yet.
          </li>
        </ul>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.list-fold-enter-active,
.list-fold-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.list-fold-enter-from,
.list-fold-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
