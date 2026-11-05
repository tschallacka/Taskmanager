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

const sections = computed(() =>
  boardColumns.value
    .filter(column => !isTrashed(column))
    .map(column => ({
      column,
      tasks: visibleColumnTasks(column.id).filter(task => !isTrashed(task))
    }))
)

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
      v-for="{ column, tasks } in sections"
      :key="column.id"
      class="mt-4"
    >
      <button
        class="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-elevated"
        @click="toggleSection(column.id)"
      >
        <UIcon
          name="i-lucide-chevron-down"
          class="size-4 text-dimmed transition-transform duration-200"
          :class="collapsed.has(column.id) ? '-rotate-90' : ''"
        />
        <span
          class="size-2 rounded-full"
          :class="columnDotAttrs(column).class"
          :style="columnDotAttrs(column).style"
        />
        <span class="text-sm font-semibold text-default">{{ column.name }}</span>
        <span class="text-xs tabular-nums text-dimmed">{{ tasks.length }}</span>
      </button>

      <Transition name="list-fold">
        <ul
          v-if="!collapsed.has(column.id)"
          class="mt-1 overflow-hidden rounded-xl border border-default bg-default"
        >
          <li
            v-for="task in tasks"
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

            <span class="hidden shrink-0 items-center gap-1 sm:flex">
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

            <span class="flex w-5 shrink-0 justify-center">
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
              class="w-16 shrink-0 text-right text-xs tabular-nums"
              :class="overdue(task) ? 'font-medium text-error' : 'text-dimmed'"
            >
              {{ task.dueOn ? dueLabel(task.dueOn) : '' }}
            </span>
          </li>

          <li
            v-if="!tasks.length"
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
