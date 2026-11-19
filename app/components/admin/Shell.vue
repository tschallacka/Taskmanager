<script setup lang="ts">
import { ADMIN_SECTIONS } from '~/utils/adminSections'

// The instance admin's shell (redesign 8/9): a left list of the admin sections, each on its own address, and the section
// in the slot. Only the instance admin reaches these pages (the middleware on each page says so).
const items = ADMIN_SECTIONS.map(s => ({ key: s.key, label: s.label, icon: s.icon, to: s.path }))
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden lg:flex-row">
    <nav
      aria-label="Admin sections"
      class="flex shrink-0 gap-1 overflow-x-auto border-b border-default p-2 lg:w-52 lg:flex-col lg:gap-0.5 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-3"
    >
      <SectionNav :items="items" />
    </nav>
    <div class="flex-1 min-h-0 min-w-0 overflow-hidden">
      <slot />
    </div>
  </div>
</template>
