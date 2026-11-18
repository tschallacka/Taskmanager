<script setup lang="ts">
definePageMeta({ layout: 'app' })

useSeoMeta({ title: 'Settings · API keys and MCP' })
</script>

<template>
  <SettingsShell>
    <SettingsApiKeys />
  </SettingsShell>
</template>
