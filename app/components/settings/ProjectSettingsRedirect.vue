<script setup lang="ts">
import { settingsTargetFor } from '~/utils/projectSettingsSections'

// The address of one project settings section (/projects/<id>/settings/<key>) only redirects: the settings view stays in
// the board page's settings tab (the ruling). The route is registered in nuxt.config.ts (pages:extend).
const route = useRoute()

onMounted(() => {
  navigateTo(settingsTargetFor(String(route.params.id), String(route.params.section)), { replace: true })
})
</script>

<template>
  <div class="p-6 text-sm text-muted">
    Opening project settings…
  </div>
</template>
