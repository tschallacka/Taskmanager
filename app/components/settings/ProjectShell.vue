<script setup lang="ts">
import { builtProjectSections, type ProjectSettingsKey } from '~/utils/projectSettingsSections'

// The project settings shell (redesign 8/9, step 4): the left list of sections, and the section in the slot. The list is
// drawn from the section table, and each item links to the section's own address, so the router takes it to the settings
// view (the redirect route, see ProjectSettingsRedirect.vue). It has the account shell's list markup. It has no top-bar
// title and no phone bottom nav, because the settings tab sits inside the board page.
defineProps<{ projectId: string, current: ProjectSettingsKey }>()

const sections = builtProjectSections()
</script>

<template>
  <div class="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[12rem_1fr]">
    <nav
      aria-label="Settings sections"
      class="flex flex-wrap gap-1 lg:flex-col"
    >
      <UButton
        v-for="s in sections"
        :key="s.key"
        :to="s.path(projectId)"
        :label="s.label"
        :icon="s.icon"
        color="neutral"
        variant="ghost"
        size="sm"
        class="shrink-0 justify-start"
        :active="s.key === current"
        :aria-current="s.key === current ? 'page' : undefined"
      />
    </nav>
    <div class="min-w-0 max-w-2xl">
      <slot />
    </div>
  </div>
</template>
