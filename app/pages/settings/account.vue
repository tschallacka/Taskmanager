<script setup lang="ts">
definePageMeta({ layout: 'app' })

useSeoMeta({ title: 'Settings · Account' })
</script>

<template>
  <SettingsShell>
    <SettingsAccount />

    <!-- Passkeys and two-factor -->
    <SecurityPanel />

    <!-- Who may see this address -->
    <EmailPrivacyPanel />
  </SettingsShell>
</template>
