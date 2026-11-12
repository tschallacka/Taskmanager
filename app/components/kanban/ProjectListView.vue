<script setup lang="ts">
import { columnDotAttrs } from '~/utils/tagColors'
import type { ProjectTask } from '~/composables/useProjects'
import { errorMessage, untypedFetch } from '~/utils/untypedFetch'
import { FIELD_WIDTH, fieldColumns, metaColumns } from '~/utils/listColumns'

const emit = defineEmits<{ openTask: [taskId: string] }>()

const { boardColumns, visibleColumnTasks, subtasksOf, personById, updateTask, isTrashed, activeProjectId } = useProjects()

// A column per custom field, each cell editable in place.
const toast = useToast()
const { fields, valueOf, setValues } = useCustomFields(activeProjectId)

async function setField(taskId: string, fieldId: string, value: string | null) {
  try {
    await setValues(taskId, { [fieldId]: value })
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not save the field'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

// The title edits in place: a click opens the field, Enter or leaving it saves, Escape keeps the old title.
// A save that fails says so, and the title keeps what the server has.
const titleTaskId = ref<string | null>(null)
const titleDraft = ref('')

function startTitle(task: ProjectTask) {
  titleDraft.value = task.title
  titleTaskId.value = task.id
}

async function commitTitle(task: ProjectTask) {
  if (titleTaskId.value !== task.id) return
  titleTaskId.value = null
  const title = titleDraft.value.trim()
  if (!title || title === task.title) return
  try {
    await updateTask(task.id, { title })
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not save the title'), icon: 'i-lucide-alert-triangle', color: 'error' })
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
type OptionalColumn = 'assignee' | 'due' | 'labels' | 'time'
const OPTIONAL_COLUMNS: { id: OptionalColumn, label: string }[] = [
  { id: 'assignee', label: 'Assignee' },
  { id: 'due', label: 'Due' },
  { id: 'labels', label: 'Labels' },
  { id: 'time', label: 'Time' }
]
const shownColumns = ref<Record<OptionalColumn, boolean>>({ assignee: true, due: true, labels: true, time: true })

// The minutes logged on each task of this board, from everyone on the team. Read once per board; a time entry logged
// in the row moves its task's total at once.
const taskMinutes = ref<Record<string, number>>({})

async function loadTaskTime() {
  if (!activeProjectId.value) return
  try {
    taskMinutes.value = await untypedFetch<Record<string, number>>(`/api/projects/${activeProjectId.value}/task-time`)
  } catch {
    taskMinutes.value = {}
  }
}

function onLogged(taskId: string, minutes: number) {
  taskMinutes.value = { ...taskMinutes.value, [taskId]: (taskMinutes.value[taskId] ?? 0) + minutes }
}

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

onMounted(() => {
  loadView()
  loadTaskTime()
})
watch(activeProjectId, () => {
  loadView()
  loadTaskTime()
})
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
      .map(group => ({ id: group.id, name: group.label, column: null, tasks: sorted(group.tasks) }))
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
    <!-- The table's one header row, on a wide screen. Its names sit over the cells, which read the same widths
         (app/utils/listColumns.ts): the task, the custom fields, then the optional columns in row order. -->
    <div
      v-if="sections.length"
      class="mt-3 hidden items-center gap-3 px-3 text-[0.6875rem] font-medium uppercase tracking-wide text-dimmed md:flex"
      data-list-header
    >
      <span class="size-5 shrink-0" />
      <span class="min-w-0 flex-1">Task</span>
      <span
        v-for="col in fieldColumns(fields)"
        :key="col.key"
        class="shrink-0 truncate px-1"
        :class="col.width"
        data-list-header-field
      >{{ col.label }}</span>
      <span class="flex shrink-0 items-center gap-2">
        <span
          v-for="col in metaColumns(shownColumns)"
          :key="col.key"
          :class="[col.width, col.key === 'assignee' ? '' : 'text-right']"
          :data-list-header-cell="col.key"
        >{{ col.label }}</span>
      </span>
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

            <div class="min-w-0 flex-1">
              <!-- The title edits in place on a click; Enter or leaving the field saves it, Escape keeps the old title. -->
              <input
                v-if="titleTaskId === task.id"
                v-model="titleDraft"
                data-list-title-input
                class="w-full min-w-0 rounded bg-default px-1.5 py-0.5 text-sm text-default outline-none ring-1 ring-primary"
                @click.stop
                @keydown.enter.prevent="commitTitle(task)"
                @keydown.escape="titleTaskId = null"
                @blur="commitTitle(task)"
              >
              <span
                v-else
                class="block truncate text-sm"
                :class="task.completedAt ? 'text-dimmed line-through' : 'text-default'"
                data-list-title
                @click.stop="startTitle(task)"
              >
                {{ task.title }}
              </span>
              <!-- On a phone the extra columns fold under the title; on a wide screen they are columns of their own. -->
              <KanbanListRowMeta
                :task="task"
                :shown="shownColumns"
                :minutes="taskMinutes[task.id] ?? 0"
                layout="fold"
                class="mt-0.5 md:hidden"
                @logged="onLogged"
              />
            </div>

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

            <!-- The wide-screen cells: the assignee, the due date and the labels, each edited in place. -->
            <KanbanListRowMeta
              :task="task"
              :shown="shownColumns"
              :minutes="taskMinutes[task.id] ?? 0"
              layout="column"
              class="hidden md:flex"
              @logged="onLogged"
            />
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
