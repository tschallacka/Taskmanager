<script setup lang="ts">
useSeoMeta({ title: 'Invitation' })

const route = useRoute()
const token = computed(() => String(route.params.token ?? ''))
const { session, isPending: sessionPending } = useAuth()

// A customer link works for whoever opens it. A team or board invitation was sent to one address, which this
// page never learns: whoever was invited has to know it. `forYou` says whether the account signed in now is
// the invited one, and is null when nobody is signed in.
type InvitationPreview
  = | { kind: 'customer', customerName: string, organizationName: string }
    | { kind: 'team', organizationName: string, inviterName: string | null, role: string, forYou: boolean | null }
    | { kind: 'board', projectName: string, inviterName: string | null, role: string, forYou: boolean | null }

// Reading the invitation also sets the cookie that lets its recipient create an
// account where sign-up is otherwise closed, so it has to happen in the browser.
const { data: invitation, error: loadError, pending } = await useFetch<InvitationPreview>(
  () => `/api/invitations/${token.value}`,
  { server: false }
)

const loadMessage = computed(() => {
  const status = loadError.value?.statusCode
  if (status === 410) return 'This invitation has already been used or has expired.'
  if (status === 404) return 'This invitation link is not valid.'
  return loadError.value ? 'This invitation could not be loaded.' : ''
})

const accepting = ref(false)
const acceptError = ref('')

// An invitation is not a sign-in: it never switches the account. When the wrong account is signed in, sign
// out and come back to this same link.
async function switchAccount() {
  await authClient.signOut()
  window.location.reload()
}

async function accept() {
  accepting.value = true
  acceptError.value = ''
  try {
    const answer = await $fetch<{ kind: 'team' | 'board' | 'customer', organizationId?: string, projectId?: string }>(
      `/api/invitations/${token.value}/accept`,
      { method: 'POST' }
    )
    // A new team member lands in that team; a guest works from their personal workspace, where
    // the boards they were let onto open.
    if (answer.kind === 'team' && answer.organizationId) {
      await authClient.organization.setActive({ organizationId: answer.organizationId })
    } else if (answer.kind === 'board') {
      await authClient.organization.setActive({ organizationId: null })
    }
    // A full load, so the projects store picks up the new boards.
    await navigateTo(answer.kind === 'board' && answer.projectId ? `/projects/${answer.projectId}` : '/projects', { external: true })
  } catch (e: unknown) {
    acceptError.value = (e as { data?: { message?: string } })?.data?.message || 'Could not accept the invitation'
  } finally {
    accepting.value = false
  }
}
</script>

<template>
  <div class="flex items-center justify-center min-h-screen bg-zinc-950">
    <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-full max-w-sm space-y-6 shadow-xl">
      <div class="text-center space-y-2">
        <AppLogo class="text-2xl mx-auto block" />
        <h1 class="text-xl font-semibold text-white">
          You're invited
        </h1>
        <p
          v-if="invitation"
          class="text-sm text-zinc-400"
        >
          <template v-if="invitation.kind === 'team'">
            {{ invitation.inviterName ?? 'Someone' }} invited you to join
            <span class="text-zinc-200 font-medium">{{ invitation.organizationName }}</span>.
          </template>
          <template v-else-if="invitation.kind === 'board'">
            {{ invitation.inviterName ?? 'Someone' }} invited you to the board
            <span class="text-zinc-200 font-medium">{{ invitation.projectName }}</span>.
          </template>
          <template v-else>
            {{ invitation.organizationName }} invited you to follow the projects of
            <span class="text-zinc-200 font-medium">{{ invitation.customerName }}</span>.
          </template>
        </p>
      </div>

      <div
        v-if="pending || sessionPending"
        class="flex justify-center py-2"
      >
        <UIcon
          name="i-lucide-loader-2"
          class="size-5 animate-spin text-zinc-500"
        />
      </div>

      <UAlert
        v-else-if="loadMessage"
        color="error"
        variant="subtle"
        :description="loadMessage"
      />

      <template v-else-if="invitation">
        <template v-if="session">
          <p class="text-sm text-zinc-400 text-center">
            Signed in as <span class="text-zinc-200">{{ session.user.email }}</span>.
          </p>
          <UAlert
            v-if="invitation.kind !== 'customer' && invitation.forYou === false"
            color="warning"
            variant="subtle"
            description="This invitation was sent to another address than the one of this account. Sign out and use the invited address, or create an account with it."
          />
          <UAlert
            v-if="acceptError"
            color="error"
            variant="subtle"
            :description="acceptError"
          />
          <UButton
            v-if="invitation.kind !== 'customer' && invitation.forYou === false"
            block
            size="lg"
            color="neutral"
            variant="outline"
            @click="switchAccount"
          >
            Sign out
          </UButton>
          <UButton
            v-else
            block
            size="lg"
            color="primary"
            :loading="accepting"
            @click="accept"
          >
            Accept invitation
          </UButton>
        </template>
        <template v-else-if="invitation.kind === 'customer'">
          <UButton
            block
            size="lg"
            color="primary"
            :to="`/login?invite=${encodeURIComponent(token)}`"
          >
            Sign in or create an account
          </UButton>
        </template>
        <template v-else>
          <p class="text-sm text-zinc-400 text-center">
            Use the email address this invitation was sent to. Anyone else cannot use it.
          </p>
          <UButton
            block
            size="lg"
            color="primary"
            :to="`/login?invite=${encodeURIComponent(token)}`"
          >
            I have an account: sign in
          </UButton>
          <UButton
            block
            size="lg"
            color="neutral"
            variant="outline"
            :to="`/login?invite=${encodeURIComponent(token)}&signup=1`"
          >
            Create an account
          </UButton>
        </template>
      </template>
    </div>
  </div>
</template>
