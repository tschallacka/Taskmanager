<script setup lang="ts">
import { AI_SETTINGS_KEY, useAiSettings } from '~/composables/useAiSettings'

definePageMeta({ layout: 'app' })

useSeoMeta({ title: 'Settings · AI' })

// The AI section's state, provided once for this page (see useAiSettings).
provide(AI_SETTINGS_KEY, useAiSettings())
</script>

<template>
  <SettingsShell>
    <SettingsAi />
  </SettingsShell>
</template>
