<script setup lang="ts">
// The phone board's column picker (redesign 9/9, design page09): one chip per column with its count. Only one column
// shows at a time below the lg breakpoint; the board decides what the chips switch. It emits, it does not store.
// The Add column control of the desktop board has no room on a phone (the board shows one column), so it lives here as
// the last chip. canAdd is false for a customer view, which has no Add column on the desktop either.
const props = defineProps<{
  columns: { id: string, name: string, count: number }[]
  activeId: string
  canAdd?: boolean
}>()

const emit = defineEmits<{
  select: [columnId: string]
  add: []
}>()
</script>

<template>
  <div
    data-testid="phone-column-picker"
    role="tablist"
    aria-label="Columns"
    class="flex gap-2 overflow-x-auto px-4 pb-2 lg:hidden"
  >
    <button
      v-for="column in props.columns"
      :key="column.id"
      type="button"
      role="tab"
      :aria-selected="column.id === props.activeId"
      class="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm"
      :class="column.id === props.activeId
        ? 'border-primary bg-primary/10 font-semibold text-primary'
        : 'border-default text-muted'"
      @click="emit('select', column.id)"
    >
      {{ column.name }}
      <span class="tabular-nums text-xs">{{ column.count }}</span>
    </button>
    <button
      v-if="props.canAdd"
      type="button"
      data-testid="phone-add-column"
      aria-label="Add column"
      class="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-default px-3 text-sm text-muted"
      @click="emit('add')"
    >
      <UIcon
        name="i-lucide-plus"
        class="size-4"
      />
      Add column
    </button>
  </div>
</template>
