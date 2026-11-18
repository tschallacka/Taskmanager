<script setup lang="ts">
definePageMeta({ layout: 'app', middleware: 'instance-admin' })

useSeoMeta({ title: 'Accounts' })
</script>

<template>
  <AdminShell>
    <div class="h-full overflow-y-auto">
      <div class="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
        <div>
          <h1 class="text-base font-semibold text-default">
            Accounts on this instance
          </h1>
          <p class="mt-1 text-xs text-muted">
            Choose who may create organisations of their own. Taking the right away leaves organisations they already own in place. Email addresses are private: type a complete address to find one account.
          </p>
        </div>
        <AdminAccountsPanel :active="true" />
      </div>
    </div>
  </AdminShell>
</template>
