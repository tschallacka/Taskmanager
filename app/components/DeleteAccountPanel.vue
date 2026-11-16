<script setup lang="ts">
import { confirmMatches, deletionLines } from '#shared/utils/deleteAccountText'

// "Delete my account": a button that opens a confirm dialog. The dialog says what happens, asks for the signed-in address,
// and deletes only when it matches. A team the person still owns, or the last instance admin, is refused: the teams are
// named, with a way to the team page. Nothing is removed on a refusal.
const { session } = useAuth()
const email = computed(() => session.value?.user?.email ?? '')
const lines = deletionLines()
const open = ref(false)
const typed = ref('')
const busy = ref(false)
const refusal = ref<{ message: string, teams: { id: string, name: string }[] } | null>(null)
const failure = ref('')
const canDelete = computed(() => confirmMatches(typed.value, email.value) && !busy.value)

watch(open, (isOpen) => {
  if (!isOpen) {
    typed.value = ''
    refusal.value = null
    failure.value = ''
  }
})

async function remove() {
  busy.value = true
  refusal.value = null
  failure.value = ''
  try {
    await $fetch('/api/account/delete', { method: 'POST', body: { confirm: typed.value } })
    // The sessions are gone on the server. Leave the page the way a signed-out visitor arrives.
    await navigateTo('/login', { external: true })
  } catch (error: unknown) {
    const e = error as { statusCode?: number, data?: { message?: string, data?: { teams?: { id: string, name: string }[] } } }
    if (e.statusCode === 409) {
      refusal.value = { message: e.data?.message ?? 'Your account cannot be deleted yet.', teams: e.data?.data?.teams ?? [] }
    } else {
      failure.value = e.data?.message ?? 'Your account could not be deleted. Nothing was removed.'
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="p-5 border-t border-default space-y-3">
    <p class="text-sm font-semibold text-default">
      Delete my account
    </p>
    <p class="text-sm text-muted">
      This removes your account. Read what happens before you start.
    </p>
    <UButton
      label="Delete my account"
      icon="i-lucide-trash-2"
      color="error"
      variant="outline"
      @click="open = true"
    />
    <UModal
      v-model:open="open"
      title="Delete my account"
      description="This cannot be undone."
    >
      <template #body>
        <div class="space-y-4">
          <ul class="list-disc pl-5 text-sm text-muted space-y-1">
            <li
              v-for="line in lines"
              :key="line"
            >
              {{ line }}
            </li>
          </ul>
          <UAlert
            v-if="refusal"
            color="warning"
            variant="subtle"
            :description="refusal.message"
          />
          <ul
            v-if="refusal && refusal.teams.length"
            class="text-sm space-y-1"
          >
            <li
              v-for="team in refusal.teams"
              :key="team.id"
            >
              {{ team.name }}
            </li>
          </ul>
          <NuxtLink
            v-if="refusal && refusal.teams.length"
            to="/team"
            class="text-sm text-primary underline"
          >
            Open the team page to hand it over or delete it
          </NuxtLink>
          <UAlert
            v-if="failure"
            color="error"
            variant="subtle"
            :description="failure"
          />
          <label class="block text-sm text-muted">
            Type <span class="font-medium text-default">{{ email }}</span> to confirm
            <UInput
              v-model="typed"
              class="mt-1 w-full"
              autocomplete="off"
              :aria-label="`Type ${email} to confirm`"
            />
          </label>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Keep my account"
            color="neutral"
            variant="ghost"
            @click="open = false"
          />
          <UButton
            label="Delete my account permanently"
            icon="i-lucide-trash-2"
            color="error"
            :disabled="!canDelete"
            :loading="busy"
            @click="remove"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
