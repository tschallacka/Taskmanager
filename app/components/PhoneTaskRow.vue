<script setup lang="ts">
// One task row on the phone home (redesign 9/9, design page 08): a ring to complete, the title, and the due date.
// Overdue dates are red. The row is at least 44 px high, so it is an easy tap target.
const props = defineProps<{
  title: string
  dueLabel?: string | null
  overdue?: boolean
}>()

const emit = defineEmits<{
  complete: []
  open: []
}>()
</script>

<template>
  <div class="flex min-h-11 items-center gap-2.5 text-base">
    <button
      type="button"
      class="flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-accented text-transparent hover:border-success hover:text-success"
      aria-label="Mark complete"
      @click="emit('complete')"
    >
      <UIcon
        name="i-lucide-check"
        class="size-3"
      />
    </button>
    <button
      type="button"
      class="min-w-0 flex-1 truncate py-2 text-left leading-[22px] text-default"
      @click="emit('open')"
    >
      {{ props.title }}
    </button>
    <span
      v-if="props.dueLabel"
      class="shrink-0 text-sm tabular-nums"
      :class="props.overdue ? 'text-error' : 'text-muted'"
    >{{ props.dueLabel }}</span>
  </div>
</template>
