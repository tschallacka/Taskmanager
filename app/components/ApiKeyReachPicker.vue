<script setup lang="ts">
// Which boards an API key reaches, picked from every board its owner can open. Select all reaches
// every board now and later; ticking a workspace reaches that workspace now and later; ticking single
// boards reaches exactly those. Unticking anything under a broader pick turns that pick off and keeps
// the rest as a fixed list, so the key never reaches a board the owner did not tick.
export interface ReachPick {
  all: boolean
  /** Workspace ids; 'personal' is the owner's personal workspace. */
  workspaces: string[]
  boards: string[]
}

export interface PickBoard {
  id: string
  name: string
  teamId: string | null
  workspace: string
}

export interface PickWorkspace {
  id: string | null
  name: string
}

const props = defineProps<{
  modelValue: ReachPick
  boards: PickBoard[]
  workspaces: PickWorkspace[]
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: ReachPick] }>()

const wsKey = (teamId: string | null) => teamId ?? 'personal'

function tickedIn(pick: ReachPick, board: PickBoard): boolean {
  return pick.all || pick.workspaces.includes(wsKey(board.teamId)) || pick.boards.includes(board.id)
}

// The same pick, with every broader choice written out as single boards.
function explode(pick: ReachPick): ReachPick {
  return { all: false, workspaces: [], boards: props.boards.filter(board => tickedIn(pick, board)).map(board => board.id) }
}

function setAll(on: boolean) {
  emit('update:modelValue', { all: on, workspaces: [], boards: [] })
}

function setWorkspace(workspace: PickWorkspace, on: boolean) {
  const inWorkspace = (boardId: string) => props.boards.some(board => board.id === boardId && board.teamId === workspace.id)
  const base = on ? props.modelValue : explode(props.modelValue)
  const workspaces = on
    ? [...new Set([...base.workspaces, wsKey(workspace.id)])]
    : base.workspaces.filter(key => key !== wsKey(workspace.id))
  emit('update:modelValue', { all: false, workspaces, boards: base.boards.filter(id => !inWorkspace(id)) })
}

function setBoard(board: PickBoard, on: boolean) {
  const base = on ? props.modelValue : explode(props.modelValue)
  const boards = on
    ? [...new Set([...base.boards, board.id])]
    : base.boards.filter(id => id !== board.id)
  emit('update:modelValue', { all: false, workspaces: base.workspaces, boards })
}

// Boards grouped under their workspace, in the order the server lists the workspaces.
const groups = computed(() => props.workspaces
  .map(workspace => ({
    workspace,
    boards: props.boards.filter(board => board.teamId === workspace.id)
  }))
  .filter(group => group.boards.length))

function workspaceTicked(workspace: PickWorkspace): boolean {
  return props.modelValue.all || props.modelValue.workspaces.includes(wsKey(workspace.id))
}
</script>

<template>
  <div class="space-y-3">
    <UCheckbox
      :model-value="modelValue.all"
      :disabled="disabled"
      label="Select all"
      description="Every board you can open, in every workspace, now and later"
      @update:model-value="(on: boolean | 'indeterminate') => setAll(on === true)"
    />

    <div
      v-for="group in groups"
      :key="group.workspace.id ?? 'personal'"
      class="pl-6 space-y-2 border-l border-default"
    >
      <UCheckbox
        :model-value="workspaceTicked(group.workspace)"
        :disabled="disabled || modelValue.all"
        :label="`Everything in ${group.workspace.name}`"
        description="The boards of this workspace, now and later"
        @update:model-value="(on: boolean | 'indeterminate') => setWorkspace(group.workspace, on === true)"
      />
      <div class="pl-6 flex flex-wrap gap-x-5 gap-y-2">
        <UCheckbox
          v-for="board in group.boards"
          :key="board.id"
          :model-value="tickedIn(modelValue, board)"
          :disabled="disabled || modelValue.all"
          :label="board.name"
          @update:model-value="(on: boolean | 'indeterminate') => setBoard(board, on === true)"
        />
      </div>
    </div>
  </div>
</template>
