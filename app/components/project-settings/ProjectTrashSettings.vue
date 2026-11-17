<script setup lang="ts">
// The Trash section of the project settings (redesign 8/9): what the board's trash holds, and the switch that shows it on
// the board. Restoring a card is still done on the board (Show trashed), as before. Nothing is removed here.
defineProps<{ projectId: string }>()

const { showTrashed, trashedCount, toggleShowTrashed } = useProjects()
</script>

<template>
  <div class="space-y-4">
    <div>
      <h3 class="text-sm font-semibold text-default">
        Trash
      </h3>
      <p class="mt-1 text-xs text-muted">
        Deleted cards and columns stay in the board's trash. Show the trash on the board to restore them.
      </p>
    </div>

    <p
      class="text-sm text-default"
      data-trash-count
    >
      {{ trashedCount }} {{ trashedCount === 1 ? 'item' : 'items' }} in the trash
    </p>

    <div class="flex flex-wrap items-center gap-2">
      <button
        class="rounded-lg border border-default px-3 py-1.5 text-xs text-default transition-colors hover:bg-elevated"
        data-trash-toggle
        @click="toggleShowTrashed()"
      >
        {{ showTrashed ? 'Hide trashed' : 'Show trashed on the board' }}
      </button>
      <NuxtLink
        :to="`/projects/${projectId}`"
        class="text-xs text-muted underline-offset-2 hover:text-default hover:underline"
      >
        Open the board
      </NuxtLink>
    </div>
  </div>
</template>
