<script setup lang="ts">
import { landingFor } from '~/utils/inviteLanding'

definePageMeta({ layout: 'app' })

useSeoMeta({ title: 'Invitations' })

// Invitations sent to this account's address that it has not accepted yet. Accepting one makes the account a contact
// of that customer, and then the shared list opens.
type Pending = { id: string, customerName: string, organizationName: string }
const { data, refresh } = await useFetch<{ invitations: Pending[] }>('/api/pending-invitations', { key: 'pending-invitations', server: false, lazy: true })
const invitations = computed(() => data.value?.invitations ?? [])
const accepting = ref<string | null>(null)
const error = ref('')

async function accept(id: string) {
  accepting.value = id
  error.value = ''
  try {
    const answer = await $fetch<{ ok: boolean, sharedProjectIds: string[] }>('/api/pending-invitations', { method: 'POST', body: { id } })
    // Lands like a customer link: the one project, or the shared list (see utils/inviteLanding).
    await navigateTo(landingFor({ kind: 'customer', sharedProjectIds: answer.sharedProjectIds }), { external: true })
  } catch (e) {
    error.value = (e as { data?: { message?: string } })?.data?.message || 'Could not accept the invitation'
    await refresh()
  } finally {
    accepting.value = null
  }
}
</script>

<template>
  <div class="flex-1 min-w-0 flex flex-col overflow-hidden pb-14 lg:pb-0">
    <Teleport
      defer
      to="#app-topbar-title"
    >
      <h1 class="text-base font-semibold text-default">
        Invitations
      </h1>
    </Teleport>

    <div class="flex-1 min-w-0 overflow-y-auto">
      <UContainer class="py-6 space-y-4">
        <p
          v-if="!invitations.length"
          class="text-sm text-muted"
        >
          Nothing is waiting for you.
        </p>

        <div
          v-for="invite in invitations"
          :key="invite.id"
          class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-default p-3"
        >
          <div class="min-w-0">
            <p class="text-sm font-medium text-default">
              {{ invite.customerName }}
            </p>
            <p class="text-xs text-muted">
              Invited by {{ invite.organizationName }}
            </p>
          </div>
          <UButton
            color="primary"
            :loading="accepting === invite.id"
            @click="accept(invite.id)"
          >
            Accept invitation
          </UButton>
        </div>

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          :description="error"
        />
      </UContainer>
    </div>
  </div>
</template>
