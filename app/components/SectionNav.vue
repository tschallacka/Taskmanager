<script setup lang="ts">
// The one list of settings sections (redesign 8/9, CQ 1): the account, project settings and admin shells draw their items
// here. Each item is a link to its own address, and the item whose key is `current` is marked. The wrapper (its layout
// and its label) stays with the shell, because a phone row and a wide column are the shell's concern.
defineProps<{
  items: { key?: string, label: string, icon: string, to: string }[]
  current?: string
}>()
</script>

<template>
  <UButton
    v-for="item in items"
    :key="item.to"
    :to="item.to"
    :label="item.label"
    :icon="item.icon"
    color="neutral"
    variant="ghost"
    size="sm"
    class="shrink-0 justify-start"
    :class="item.key !== undefined && item.key === current ? 'bg-elevated font-medium text-default' : ''"
    :aria-current="item.key !== undefined && item.key === current ? 'page' : undefined"
  />
</template>
