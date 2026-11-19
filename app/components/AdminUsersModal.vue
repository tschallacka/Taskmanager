<script setup lang="ts">
// The accounts list in a modal, for the Instance settings page. The same panel as the Accounts page (AdminAccountsPanel).
const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <UModal
    v-model:open="open"
    title="Accounts on this instance"
    description="Choose who may create organisations of their own. Taking the right away leaves organisations they already own in place. Email addresses are private: type a complete address to find one account."
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <AdminAccountsPanel :active="open" />
    </template>
  </UModal>
</template>
