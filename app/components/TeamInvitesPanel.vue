<script setup lang="ts">
import { errorMessage, untypedFetch } from '~/utils/untypedFetch'

// Invite someone to the team by email address, on the Members section of /team. Owners and admins
// only: an owner may also invite an admin. The link comes back once and is mailed too when the
// instance can send mail; only the account with that address can use it, and it lets that person
// sign up even when sign-up is closed.
const props = defineProps<{ teamId: string, isOwner: boolean }>()

interface OpenInvitation { id: string, email: string, role: string, createdAt: number, expiresAt: number, canWithdraw: boolean }
interface Issued { id: string, email: string, role: string, url: string, emailed: boolean }

const toast = useToast()
const email = ref('')
const role = ref<'member' | 'admin'>('member')
const sending = ref(false)
const error = ref('')
const issued = ref<Issued | null>(null)
const open = ref<OpenInvitation[]>([])
const busy = ref('')

const base = computed(() => `/api/teams/${props.teamId}/invitations`)

async function load() {
  open.value = await untypedFetch<OpenInvitation[]>(base.value).catch(() => [])
}
watch(() => props.teamId, load, { immediate: true })

async function send() {
  if (!email.value.includes('@') || sending.value) return
  sending.value = true
  error.value = ''
  issued.value = null
  try {
    issued.value = await untypedFetch<Issued>(base.value, { method: 'POST', body: { email: email.value, role: role.value } })
    email.value = ''
    await load()
  } catch (e) {
    error.value = errorMessage(e, 'Could not invite that person')
  } finally {
    sending.value = false
  }
}

async function withdraw(invitation: OpenInvitation) {
  busy.value = invitation.id
  try {
    await untypedFetch(`${base.value}/${invitation.id}`, { method: 'DELETE' })
    await load()
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not withdraw that'), icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    busy.value = ''
  }
}

async function copy(text: string) {
  await navigator.clipboard.writeText(text)
  toast.add({ title: 'Link copied', icon: 'i-lucide-clipboard-check', duration: 2000 })
}
</script>

<template>
  <div
    class="space-y-3 rounded-xl border border-default p-4"
    data-team-invites
  >
    <div>
      <p class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
        Invite by email
        <HelpHint page="team/invite-people-by-email">
          Each link works for one email address and for 14 days. Owners can invite admins, admins can invite members.
        </HelpHint>
      </p>
      <p class="mt-0.5 text-xs text-muted">
        They get a link that works for that address only. Someone without an account can create one with it.
      </p>
    </div>

    <form
      class="flex flex-wrap items-center gap-2"
      @submit.prevent="send"
    >
      <UInput
        v-model="email"
        type="email"
        placeholder="name@example.com"
        class="min-w-0 flex-1"
        data-invite-email
      />
      <select
        v-model="role"
        class="rounded-md border border-default bg-transparent px-2 py-1.5 text-sm text-default outline-none focus:border-primary"
        aria-label="Role"
        data-invite-role
      >
        <option value="member">
          Member
        </option>
        <option
          v-if="isOwner"
          value="admin"
        >
          Admin
        </option>
      </select>
      <UButton
        type="submit"
        label="Invite"
        :loading="sending"
        :disabled="!email.includes('@')"
        data-invite-send
      />
    </form>
    <p
      v-if="error"
      class="text-xs text-error"
      data-invite-error
    >
      {{ error }}
    </p>

    <div
      v-if="issued"
      class="space-y-1.5 rounded-md bg-elevated px-3 py-2"
      data-invite-issued
    >
      <p class="text-xs text-default">
        {{ issued.emailed ? `Invitation mailed to ${issued.email}.` : `Send this link to ${issued.email}. This instance cannot send mail, or it failed.` }}
      </p>
      <div class="flex items-center gap-2">
        <code class="min-w-0 flex-1 truncate rounded bg-default px-2 py-1 text-xs">{{ issued.url }}</code>
        <UButton
          label="Copy"
          icon="i-lucide-copy"
          size="xs"
          color="neutral"
          variant="soft"
          @click="copy(issued.url)"
        />
      </div>
    </div>

    <ul
      v-if="open.length"
      class="divide-y divide-default overflow-hidden rounded-lg border border-default"
    >
      <li
        v-for="invitation in open"
        :key="invitation.id"
        class="flex items-center gap-3 px-3 py-2"
        data-invite-open
      >
        <UIcon
          name="i-lucide-mail"
          class="size-4 shrink-0 text-muted"
        />
        <div class="min-w-0 flex-1">
          <p class="truncate text-xs text-default">
            {{ invitation.email }}
          </p>
          <p class="text-[11px] text-muted">
            Invited as {{ invitation.role }} · open until {{ new Date(invitation.expiresAt).toLocaleDateString() }}
          </p>
        </div>
        <UButton
          v-if="invitation.canWithdraw"
          label="Withdraw"
          size="xs"
          color="neutral"
          variant="ghost"
          :disabled="busy === invitation.id"
          @click="withdraw(invitation)"
        />
      </li>
    </ul>
  </div>
</template>
