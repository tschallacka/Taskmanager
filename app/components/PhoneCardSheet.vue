<script setup lang="ts">
// The phone's bottom sheet for one board card (redesign 9/9, design page09). It only emits: the board decides what
// each action does, so the sheet calls the same functions as the rest of the board (updateTask, moveTask, deleteTask).
import { watch } from 'vue'

const props = defineProps<{
  open: boolean
  title: string
  columns: { id: string, name: string }[]
  currentColumnId: string
  people: { id: string, name: string }[]
  currentAssigneeId: string | null
  dueOn: string | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'done': []
  'move': [columnId: string]
  'assign': [personId: string | null]
  'due': [dueOn: string | null]
  'delete': []
}>()

// The sheet has three steps: the actions, the assignee list, and the due date. Each step resets when the sheet opens.
const step = ref<'main' | 'assign' | 'due'>('main')
const dueDraft = ref('')
watch(() => props.open, (open) => {
  if (open) {
    step.value = 'main'
    dueDraft.value = props.dueOn ?? ''
  }
})

// The actions, in the design's order: Mark done, Assign to, Move to (the column chips), Set due date, Delete.
const actions = [
  { key: 'done', label: 'Mark done', icon: 'i-lucide-circle-check', danger: false },
  { key: 'assign', label: 'Assign to…', icon: 'i-lucide-user-round', danger: false },
  { key: 'due', label: 'Set due date…', icon: 'i-lucide-calendar', danger: false },
  { key: 'delete', label: 'Delete', icon: 'i-lucide-trash-2', danger: true }
] as const

function run(key: (typeof actions)[number]['key']) {
  if (key === 'assign') {
    step.value = 'assign'
    return
  }
  if (key === 'due') {
    step.value = 'due'
    return
  }
  if (key === 'done') emit('done')
  if (key === 'delete') emit('delete')
  emit('update:open', false)
}

function moveTo(columnId: string) {
  emit('move', columnId)
  emit('update:open', false)
}

function assignTo(personId: string | null) {
  emit('assign', personId)
  emit('update:open', false)
}

function saveDue(value: string | null) {
  emit('due', value)
  emit('update:open', false)
}
</script>

<template>
  <UModal
    :open="props.open"
    :title="props.title"
    :ui="{ title: 'min-w-0 truncate pe-10' }"
    @update:open="(v: boolean) => emit('update:open', v)"
  >
    <template #body>
      <!-- Step: the actions -->
      <template v-if="step === 'main'">
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

      <!-- Step: the assignee -->
      <template v-else-if="step === 'assign'">
        <button
          type="button"
          class="mb-2 min-h-11 text-sm text-primary"
          @click="step = 'main'"
        >
          ‹ Back
        </button>
        <ul class="divide-y divide-default">
          <li>
            <button
              type="button"
              class="flex min-h-11 w-full items-center text-left text-base text-default"
              :aria-current="props.currentAssigneeId === null ? 'true' : undefined"
              @click="assignTo(null)"
            >
              Unassigned
            </button>
          </li>
          <li
            v-for="person in props.people"
            :key="person.id"
          >
            <button
              type="button"
              class="flex min-h-11 w-full items-center text-left text-base text-default"
              :aria-current="props.currentAssigneeId === person.id ? 'true' : undefined"
              @click="assignTo(person.id)"
            >
              {{ person.name }}
            </button>
          </li>
        </ul>
      </template>

      <!-- Step: the due date -->
      <template v-else>
        <button
          type="button"
          class="mb-2 min-h-11 text-sm text-primary"
          @click="step = 'main'"
        >
          ‹ Back
        </button>
        <label class="flex flex-col gap-2 text-sm text-default">
          Due date
          <input
            v-model="dueDraft"
            type="date"
            class="min-h-11 rounded-md border border-default bg-default px-3 text-base"
          >
        </label>
        <div class="mt-4 flex gap-2">
          <UButton
            label="Clear"
            color="neutral"
            variant="ghost"
            class="min-h-11"
            @click="saveDue(null)"
          />
          <UButton
            label="Save"
            color="primary"
            class="min-h-11 flex-1 justify-center"
            :disabled="!dueDraft"
            @click="saveDue(dueDraft)"
          />
        </div>
      </template>
    </template>
  </UModal>
</template>
