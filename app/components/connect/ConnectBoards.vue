<script setup lang="ts">
import { CONNECT_PERMISSIONS } from '~/utils/connectPrompt'
import type { ConnectBoardChoice } from '~/utils/connectPrompt'

/** The boards a token reaches, each with what it may do there. A board not in the map is not on the token. */
const props = defineProps<{
  boards: ConnectBoardChoice[]
  modelValue: Record<string, string[]>
  canManageCrews: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, string[]>]
}>()

const permissions = computed(() => CONNECT_PERMISSIONS.filter(permission => props.canManageCrews || permission.scope !== 'crews:manage'))

// Grouped by workspace, so a person picking boards from several sees where each one lives.
const groups = computed(() => {
  const byWorkspace = new Map<string, ConnectBoardChoice[]>()
  for (const board of props.boards) {
    byWorkspace.set(board.workspace, [...(byWorkspace.get(board.workspace) ?? []), board])
  }
  return [...byWorkspace.entries()].map(([workspace, boards]) => ({ workspace, boards }))
})

function selected(boardId: string): boolean {
  return Object.hasOwn(props.modelValue, boardId)
}

function has(boardId: string, scope: string): boolean {
  return props.modelValue[boardId]?.includes(scope) ?? false
}

function toggleBoard(boardId: string, on: boolean) {
  // A board ticked on starts with reading and changing tasks; the owner unticks what it should not do.
  const next = Object.fromEntries(Object.entries(props.modelValue).filter(([id]) => id !== boardId))
  if (on) next[boardId] = ['boards:read', 'boards:write']
  emit('update:modelValue', next)
}

function toggleScope(boardId: string, scope: string, on: boolean) {
  const current = props.modelValue[boardId] ?? []
  const scopes = on ? [...current, scope] : current.filter(item => item !== scope)
  emit('update:modelValue', { ...props.modelValue, [boardId]: scopes })
}
</script>

<template>
  <div class="space-y-3">
    <div
      v-for="group in groups"
      :key="group.workspace"
      class="space-y-2"
    >
      <p class="text-xs font-medium text-muted uppercase tracking-wider">
        {{ group.workspace }}
      </p>
      <div
        v-for="board in group.boards"
        :key="board.id"
        class="rounded-lg border border-default px-3 py-2.5 space-y-2"
        :data-board="board.id"
      >
        <UCheckbox
          :model-value="selected(board.id)"
          :label="board.name"
          :disabled="disabled"
          @update:model-value="toggleBoard(board.id, $event === true)"
        />
        <div
          v-if="selected(board.id)"
          class="pl-6 flex flex-col gap-2"
        >
          <p class="text-xs text-muted">
            Claude may:
          </p>
          <UCheckbox
            v-for="permission in permissions"
            :key="permission.scope"
            :model-value="has(board.id, permission.scope)"
            :label="permission.label"
            :description="permission.description"
            :disabled="disabled"
            @update:model-value="toggleScope(board.id, permission.scope, $event === true)"
          />
        </div>
      </div>
    </div>
    <p
      v-if="!boards.length"
      class="text-xs text-muted"
    >
      No boards you can open yet.
    </p>
  </div>
</template>
