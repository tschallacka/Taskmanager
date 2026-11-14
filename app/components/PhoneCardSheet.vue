<script setup lang="ts">
// The phone's bottom sheet for one board card (redesign 9/9, design page09). It only emits: the board decides what
// each action does, so the sheet calls the same functions as the rest of the board (updateTask, moveTask, deleteTask).
const props = defineProps<{
  open: boolean
  title: string
  columns: { id: string, name: string }[]
  currentColumnId: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  done: []
  move: [columnId: string]
  assign: []
  due: []
  delete: []
}>()

// The actions, in the design's order: Mark done, Assign to, Move to (the column chips), Set due date, Delete.
// Move to is a list of its own below, one chip per column, so the picker and the sheet agree.
const actions = [
  { key: 'done', label: 'Mark done', icon: 'i-lucide-circle-check', danger: false },
  { key: 'assign', label: 'Assign to…', icon: 'i-lucide-user-round', danger: false },
  { key: 'due', label: 'Set due date…', icon: 'i-lucide-calendar', danger: false },
  { key: 'delete', label: 'Delete', icon: 'i-lucide-trash-2', danger: true }
] as const

function run(key: (typeof actions)[number]['key']) {
  if (key === 'done') emit('done')
  if (key === 'assign') emit('assign')
  if (key === 'due') emit('due')
  if (key === 'delete') emit('delete')
  emit('update:open', false)
}

function moveTo(columnId: string) {
  emit('move', columnId)
  emit('update:open', false)
}
</script>

<template>
  <UModal
    :open="props.open"
    :title="props.title"
    @update:open="(v: boolean) => emit('update:open', v)"
  >
    <template #body>
      <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-dimmed">
        Move to
      </p>
      <div class="mb-4 flex flex-wrap gap-2">
        <button
          v-for="column in props.columns"
          :key="column.id"
          type="button"
          class="min-h-11 rounded-full border px-3 text-sm"
          :class="column.id === props.currentColumnId ? 'border-primary text-primary' : 'border-default text-default'"
          :aria-current="column.id === props.currentColumnId ? 'true' : undefined"
          @click="moveTo(column.id)"
        >
          {{ column.name }}
        </button>
      </div>
      <ul class="divide-y divide-default">
        <li
          v-for="action in actions"
          :key="action.key"
        >
          <button
            type="button"
            class="flex min-h-11 w-full items-center gap-3 text-left text-base"
            :class="action.danger ? 'text-error' : 'text-default'"
            @click="run(action.key)"
          >
            <UIcon
              :name="action.icon"
              class="size-5"
            />
            {{ action.label }}
          </button>
        </li>
      </ul>
    </template>
  </UModal>
</template>
