<script setup lang="ts">
import { inviteSentence } from '~/utils/inviteSentence'
import { inviteLinks } from '~/utils/inviteLinks'
import { landingFor } from '~/utils/inviteLanding'
import { shareLine } from '~/utils/inviteShareLine'
import { formLinksFor } from '~/utils/lockedEmail'

useSeoMeta({ title: 'Invitation' })

const route = useRoute()
const token = computed(() => String(route.params.token ?? ''))
const { session, isPending: sessionPending } = useAuth()

// A customer link works for whoever opens it. A team or board invitation was sent to one address, which this
// page never learns: whoever was invited has to know it. `forYou` says whether the account signed in now is
// the invited one, and is null when nobody is signed in.
type InvitationPreview
  = | { kind: 'customer', customerName: string, organizationName: string, sharedProjectCount: number, email?: string | null }
    | { kind: 'team', organizationName: string, inviterName: string | null, role: string, forYou: boolean | null, email?: string | null }
    | { kind: 'board', projectName: string, organizationName: string | null, inviterName: string | null, role: string, forYou: boolean | null, email?: string | null }

// Reading the invitation also sets the cookie that lets its recipient create an
// account where sign-up is otherwise closed, so it has to happen in the browser.
const { data: invitation, error: loadError, pending } = await useFetch<InvitationPreview>(
  () => `/api/invitations/${token.value}`,
  { server: false }
)

// The words for a team or a board invitation. The page does not learn the address (see above), so the
// footnote with the email is not shown here, and the invitee's name is not known yet.
const words = computed(() => {
  const invite = invitation.value
  if (!invite || invite.kind === 'customer') return null
  if (invite.kind === 'team') {
    return inviteSentence({ kind: 'team', org: invite.organizationName, name: null, email: '' })
  }
  return inviteSentence({
    kind: 'project',
    org: invite.organizationName ?? invite.inviterName ?? 'Someone',
    project: invite.projectName,
    name: null,
    email: ''
  })
})

// The registration form is the default for every kind; the plain link under the button signs in instead.
// A link tied to an address carries it to the forms, where it is prefilled and locked (see utils/lockedEmail).
const links = computed(() => {
  const email = invitation.value?.email ?? null
  return email ? formLinksFor(token.value, email) : inviteLinks(token.value)
})

// What is shared, said only when the page knows it (see utils/inviteShareLine). A customer invitation only.
const shareText = computed(() => {
  const invite = invitation.value
  if (!invite || invite.kind !== 'customer') return null
  return shareLine({ count: invite.sharedProjectCount, signedIn: !!session.value, organizationName: invite.organizationName })
})

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
    const answer = await $fetch<{ kind: 'team' | 'board' | 'customer', organizationId?: string, projectId?: string, sharedProjectIds?: string[] }>(
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
    // Where the invitation says: the team, the board, or the customer's shared project (see utils/inviteLanding).
    // A full load, so the projects store picks up the new boards.
    const landing = answer.kind === 'board' && answer.projectId
      ? landingFor({ kind: 'board', projectId: answer.projectId })
      : answer.kind === 'customer'
        ? landingFor({ kind: 'customer', sharedProjectIds: answer.sharedProjectIds ?? [] })
        : landingFor({ kind: 'team' })
    await navigateTo(landing, { external: true })
  } catch (e: unknown) {
    acceptError.value = (e as { data?: { message?: string } })?.data?.message || 'Could not accept the invitation'
  } finally {
    accepting.value = false
  }
}
</script>

<template>
  <div class="flex items-center justify-center min-h-screen bg-default px-4">
    <div class="bg-elevated border border-default rounded-2xl p-8 w-full max-w-sm space-y-6 shadow-xl">
      <div class="text-center space-y-2">
        <AppLogo class="text-2xl mx-auto block" />
        <h1 class="text-xl font-semibold text-default">
          {{ words ? words.headline : "You're invited" }}
        </h1>
        <p
          v-if="invitation"
          class="text-sm text-muted"
        >
          <template v-if="words">
            {{ words.sentence }}
          </template>
          <template v-else-if="invitation.kind === 'customer'">
            {{ invitation.organizationName }} invited you to follow the projects of
            <span class="text-default font-medium">{{ invitation.customerName }}</span>.
          </template>
        </p>
      </div>

      <div
        v-if="pending || sessionPending"
        class="flex justify-center py-2"
      >
        <UIcon
          name="i-lucide-loader-2"
          class="size-5 animate-spin text-dimmed"
        />
      </div>

      <UAlert
        v-else-if="loadMessage"
        color="error"
        variant="subtle"
        :description="loadMessage"
      />

      <template v-else-if="invitation">
        <p
          v-if="shareText"
          class="text-sm text-muted text-center"
        >
          {{ shareText }}
        </p>
        <template v-if="session">
          <p class="text-sm text-muted text-center">
            Signed in as <span class="text-default">{{ session.user.email }}</span>.
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
            {{ words ? words.button : 'Accept invitation' }}
          </UButton>
        </template>
        <template v-else>
          <p
            v-if="invitation.kind !== 'customer'"
            class="text-sm text-muted text-center"
          >
            Use the email address this invitation was sent to. Anyone else cannot use it.
          </p>
          <p
            v-if="invitation.email"
            class="text-sm text-muted text-center"
          >
            This invitation is for <span class="text-default">{{ invitation.email }}</span>.
          </p>
          <UButton
            block
            size="lg"
            color="primary"
            :to="links.primary"
          >
            {{ words ? words.button : 'Create an account' }}
          </UButton>
          <p class="text-sm text-muted text-center">
            Already have an account?
            <NuxtLink
              :to="links.signIn"
              class="text-primary underline"
            >Sign in</NuxtLink>
          </p>
        </template>
      </template>
    </div>
  </div>
</template>
