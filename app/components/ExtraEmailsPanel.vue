<script setup lang="ts">
// The account's extra addresses. The list and the actions are the owner's alone (the API answers only the
// account that holds them), and a waiting address counts for nothing until its link is opened.
interface ExtraEmail {
  id: string
  email: string
  verified: boolean
}

const toast = useToast()

const emails = ref<ExtraEmail[]>([])
const loading = ref(true)
const newEmail = ref('')
const adding = ref(false)
const removing = ref<string | null>(null)

// Errors from the server carry the reason in their message; anything else gets the plain fallback.
function reasonOf(error: unknown, fallback: string) {
  const message = (error as { data?: { message?: string } } | null)?.data?.message
  return message || fallback
}

async function load() {
  loading.value = true
  try {
    emails.value = await $fetch<ExtraEmail[]>('/api/account/emails')
  } catch (error) {
    toast.add({ title: 'Could not load your extra addresses', description: reasonOf(error, ''), icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    loading.value = false
  }
}

async function addEmail() {
  if (!newEmail.value.trim()) return
  adding.value = true
  try {
    await $fetch('/api/account/emails', { method: 'POST', body: { email: newEmail.value.trim() } })
    newEmail.value = ''
    toast.add({ title: 'Confirmation link sent', description: 'Open it in that address\'s inbox, while signed in to this account.', icon: 'i-lucide-mail', duration: 5000 })
    await load()
  } catch (error) {
    toast.add({ title: 'Could not add the address', description: reasonOf(error, 'Try again.'), icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    adding.value = false
  }
}

async function removeEmail(row: ExtraEmail) {
  removing.value = row.id
  try {
    await $fetch(`/api/account/emails/${row.id}`, { method: 'DELETE' })
    toast.add({ title: 'Address removed', icon: 'i-lucide-trash', duration: 2000 })
    await load()
  } catch (error) {
    toast.add({ title: 'Could not remove the address', description: reasonOf(error, 'Try again.'), icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    removing.value = null
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-4">
      <div class="size-8 rounded-lg bg-elevated flex items-center justify-center shrink-0">
        <UIcon
          name="i-lucide-at-sign"
          class="size-4 text-default"
        />
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium">
          Extra email addresses
        </p>
        <p class="text-xs text-muted mt-0.5">
          Sign in with them and receive invitations at them, once you confirm each one through the link we send there.
          Needs two-factor authentication or a passkey on this account. While an extra address is on the account, you cannot turn two-factor off or remove your last passkey.
        </p>
      </div>
    </div>

    <div class="pl-12 space-y-3">
      <div class="flex gap-2">
        <UInput
          v-model="newEmail"
          type="email"
          placeholder="another@example.com"
          icon="i-lucide-mail-plus"
          class="flex-1"
          :disabled="adding"
          @keydown.enter="addEmail"
        />
        <UButton
          label="Add address"
          icon="i-lucide-plus"
          size="sm"
          color="primary"
          :loading="adding"
          :disabled="!newEmail.trim()"
          @click="addEmail"
        />
      </div>

      <p
        v-if="loading"
        class="text-xs text-muted"
      >
        Loading addresses…
      </p>
      <p
        v-else-if="!emails.length"
        class="text-xs text-muted"
      >
        No extra addresses yet.
      </p>
      <div
        v-else
        class="divide-y divide-default border border-default rounded-lg"
      >
        <div
          v-for="row in emails"
          :key="row.id"
          class="px-3 py-2.5 flex items-center gap-3"
        >
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">
              {{ row.email }}
            </p>
            <p class="text-xs text-muted mt-0.5">
              {{ row.verified ? 'Confirmed' : 'Waiting for its confirmation link' }}
            </p>
          </div>
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="xs"
            :aria-label="`Remove ${row.email}`"
            :loading="removing === row.id"
            @click="removeEmail(row)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
