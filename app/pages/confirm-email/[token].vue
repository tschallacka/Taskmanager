<script setup lang="ts">
useSeoMeta({ title: 'Confirm an email address' })

// The link is opened from the mail, in a browser that may not be signed in. The address is confirmed only for
// the account that added it, so this page posts the token and shows what came back. It never reads the
// address out of the link.
const route = useRoute()
const token = computed(() => String(route.params.token ?? ''))

const state = ref<'working' | 'done' | 'signed-out' | 'failed'>('working')
const message = ref('')
const confirmedEmail = ref('')

onMounted(async () => {
  try {
    const result = await $fetch<{ ok: boolean, email: string }>('/api/account/emails/confirm', {
      method: 'POST',
      body: { token: token.value }
    })
    confirmedEmail.value = result.email
    state.value = 'done'
  } catch (error) {
    const status = (error as { statusCode?: number } | null)?.statusCode
    const reason = (error as { data?: { message?: string } } | null)?.data?.message
    if (status === 401) {
      state.value = 'signed-out'
      message.value = 'Sign in to the account that added this address, then open this link again.'
    } else {
      state.value = 'failed'
      message.value = reason || 'This link could not be used.'
    }
  }
})
</script>

<template>
  <main class="min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-md rounded-xl border border-default bg-default p-6 space-y-4">
      <template v-if="state === 'working'">
        <p class="text-sm text-muted">
          Confirming the address…
        </p>
      </template>

      <template v-else-if="state === 'done'">
        <div class="flex items-center gap-2">
          <UIcon
            name="i-lucide-check"
            class="size-5 text-primary"
          />
          <h1 class="text-lg font-semibold">
            Address confirmed
          </h1>
        </div>
        <p class="text-sm text-muted">
          {{ confirmedEmail }} is now an extra address on your account. You can sign in with it, and invitations sent to it reach you.
        </p>
        <NuxtLink
          to="/"
          class="text-sm text-primary underline"
        >
          Go to your workspace
        </NuxtLink>
      </template>

      <template v-else>
        <h1 class="text-lg font-semibold">
          {{ state === 'signed-out' ? 'Sign in first' : 'This link cannot be used' }}
        </h1>
        <p class="text-sm text-muted">
          {{ message }}
        </p>
        <NuxtLink
          v-if="state === 'signed-out'"
          to="/login"
          class="text-sm text-primary underline"
        >
          Sign in
        </NuxtLink>
        <NuxtLink
          v-if="state === 'failed'"
          to="/settings#extra-emails"
          class="text-sm text-primary underline"
        >
          Go to Settings, Extra email addresses
        </NuxtLink>
      </template>
    </div>
  </main>
</template>
