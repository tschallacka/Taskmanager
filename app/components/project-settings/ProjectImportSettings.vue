<script setup lang="ts">
// The Import section of the project settings (redesign 8/9): restore a board from a backup file. The import itself is
// KanbanBoardImport, unchanged; it moved here out of General so that General holds only the general settings.
defineProps<{ projectId: string }>()
</script>

<template>
  <div class="space-y-4">
    <KanbanBoardImport :project-id="projectId" />
  </div>
</template>
