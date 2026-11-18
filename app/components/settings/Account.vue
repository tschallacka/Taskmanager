<script setup lang="ts">
import { computed } from 'vue'
import { format } from 'date-fns'

// Account: your name, email and sign-out, and the profile editor. The session is the one the whole app reads.
const { session, signOut, refreshSession } = useAuth()

const memberSince = computed(() => {
  const date = session.value?.user?.createdAt
  if (!date) return '—'
  return format(new Date(date), 'MMMM yyyy')
})
</script>

<template>
  <div
    id="account"
    class="rounded-xl border border-default bg-default overflow-hidden"
  >
    <div class="px-5 py-3 border-b border-default bg-elevated/40">
      <span class="text-xs font-semibold text-muted uppercase tracking-wider">Account</span>
    </div>
    <div class="p-5 flex items-center gap-4">
      <div class="min-w-0">
        <p class="font-semibold truncate">
          {{ session?.user?.name }}
        </p>
        <p class="text-sm text-muted truncate">
          {{ session?.user?.email }}
        </p>
        <p class="text-xs text-muted mt-1">
          Member since {{ memberSince }}
        </p>
      </div>
      <UButton
        label="Sign out"
        icon="i-lucide-log-out"
        variant="ghost"
        color="error"
        size="sm"
        class="ml-auto shrink-0"
        @click="signOut"
      />
    </div>
    <AccountProfileEditor
      :user-id="session?.user?.id ?? ''"
      :name="session?.user?.name ?? null"
      :email="session?.user?.email ?? null"
      :image="session?.user?.image ?? null"
      @changed="refreshSession()"
    />
    <DeleteAccountPanel />
  </div>
</template>
