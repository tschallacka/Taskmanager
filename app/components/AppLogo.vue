<script setup lang="ts">
// The instance's name and icon (the instance admin sets them under Branding). The built-in logo until then.
const { data: branding } = useFetch<{ name: string, hasIcon: boolean }>('/api/branding', { key: 'instance-branding', server: false })
const name = computed(() => branding.value?.name || 'Taskmanager')
const isDefaultName = computed(() => name.value === 'Taskmanager')
</script>

<template>
  <span class="inline-flex items-center gap-2 select-none">
    <img
      :src="branding?.hasIcon ? '/api/branding/icon' : '/logo.png'"
      alt=""
      class="h-[1em] w-auto"
    >
    <span
      v-if="isDefaultName"
      class="font-bold tracking-tight"
    ><span class="text-[var(--ui-primary)]">Task</span>manager</span>
    <span
      v-else
      class="font-bold tracking-tight"
    >{{ name }}</span>
  </span>
</template>
