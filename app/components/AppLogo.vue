<script setup lang="ts">
import { DEFAULT_BRAND, useBrand } from '~/composables/useBrand'

// The name and logo come from Instance settings (useBrand). With the defaults the wordmark keeps its two-colour form.
const { data: brand } = useBrand()
const customized = computed(() => brand.value.name !== DEFAULT_BRAND.name || brand.value.logoSrc !== null)
</script>

<template>
  <span class="inline-flex items-center gap-2 select-none">
    <img
      :src="brand.logoSrc ?? '/logo.svg'"
      alt=""
      class="h-[1em] w-auto"
    >
    <span
      v-if="customized"
      class="font-bold tracking-tight truncate"
    >{{ brand.name }}</span>
    <span
      v-else
      class="font-bold tracking-tight"
    ><span class="text-[var(--ui-primary)]">Task</span>manager</span>
  </span>
</template>
