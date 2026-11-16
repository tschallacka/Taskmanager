<script setup lang="ts">
import { AI_SETTINGS_KEY, useAiSettings } from '~/composables/useAiSettings'
import { sectionPathForHash } from '~/utils/settingsSections'

definePageMeta({ layout: 'app' })

useSeoMeta({ title: 'Settings' })

// Your stats. The stats need the AI totals, so the page provides the AI state (one set of refs for this page).
provide(AI_SETTINGS_KEY, useAiSettings())

// An old link to a section on this page (/settings#account) goes to that section's own address.
onMounted(() => {
  const path = sectionPathForHash(window.location.hash)
  if (path && path !== '/settings') navigateTo(path, { replace: true })
})
</script>

<template>
  <SettingsShell>
    <SettingsStats />
    <div class="pb-6">
      <LegalLinks />
    </div>
  </SettingsShell>
</template>
