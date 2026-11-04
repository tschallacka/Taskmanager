<script setup lang="ts">
import { realtimeHeaders } from '~/composables/useRealtime'
import { errorMessage, untypedFetch } from '~/utils/untypedFetch'

// The Share control in a board's header: an avatar stack and a Share button that opens the dialog
// where people are let onto the board. A project admin invites guests (editor or manager guest, and
// the domain a manager guest may invite at); a manager guest invites at their own domain and must ask
// a project admin for anyone else. A team member who is neither keeps the plain public-link popover.
// The server decides every one of those rules; this only shows them and sends the changes.
type GuestRole = 'editor' | 'manager'

interface Guest { userId: string, name: string, email: string, image: string | null, role: GuestRole, allowedDomain: string | null }
interface Invitation {
  id: string
  email: string
  role: GuestRole
  status: 'open' | 'awaiting_approval'
  reason: string | null
  invitedBy: string | null
  invitedByName: string | null
  createdAt: number
  expiresAt: number
}
interface Listing {
  me: { kind: 'admin' } | { kind: 'guest-manager', allowedDomain: string | null }
  guests: Guest[]
  invitations: Invitation[]
}
interface StaffPerson { id: string, name: string, email: string, image: string | null, teamRole: 'owner' | 'admin' | 'member', isProjectOwner: boolean, role: 'manager' | 'member' | null, explicit: boolean }
interface InviteAnswer { id: string, email: string, status: 'open' | 'awaiting_approval', url?: string, emailed?: boolean }

const props = defineProps<{
  projectId: string
  projectName: string
  /** A customer's contact or a guest: they never see the team's own people. */
  outsideReader: boolean
  isPublic: boolean
  publicUntil: number | null
  publicLink: string
  saveSharing: (isPublic: boolean, publicUntil: number | null) => Promise<{ isPublic: boolean, publicUntil: number | null }>
}>()

const toast = useToast()
const { session } = useAuth()
const { activeTeam } = useTeams()
const people = computed(() => boardPeople())

const listing = ref<Listing | null>(null)
const staff = ref<StaffPerson[]>([])
const open = ref(false)
const loadingList = ref(false)
// 'unknown' until the first answer; 'none' for someone who may not share the board.
const authority = computed<'unknown' | 'none' | 'admin' | 'guest-manager'>(() => {
  if (denied.value) return 'none'
  return listing.value ? listing.value.me.kind : 'unknown'
})
const denied = ref(false)
const myDomain = computed(() => (listing.value?.me.kind === 'guest-manager' ? listing.value.me.allowedDomain : null))

const base = computed(() => `/api/projects/${props.projectId}`)

async function loadListing() {
  loadingList.value = true
  try {
    listing.value = await untypedFetch<Listing>(`${base.value}/guests`)
    denied.value = false
  } catch {
    listing.value = null
    denied.value = true
  } finally {
    loadingList.value = false
  }
  if (!props.outsideReader && listing.value?.me.kind === 'admin') {
    staff.value = (await untypedFetch<{ people: StaffPerson[] }>(`${base.value}/members`).catch(() => ({ people: [] as StaffPerson[] }))).people
  }
}

// ─── Invite ────────────────────────────────────────────────

const email = ref('')
const role = ref<GuestRole>('editor')
const domain = ref('')
const domainTouched = ref(false)
const reason = ref('')
const inviting = ref(false)
const inviteError = ref('')
const lastInvite = ref<InviteAnswer | null>(null)

function domainOf(address: string): string {
  const at = address.lastIndexOf('@')
  return at < 0 ? '' : address.slice(at + 1).trim().toLowerCase()
}

// A public mail provider is never offered as a manager guest's domain.
function suggestedDomain(address: string): string {
  const domain = domainOf(address)
  return isPublicMailDomain(domain) ? '' : domain
}

// A manager guest's domain follows the address typed, until the admin writes their own.
watch(email, (value) => {
  if (role.value === 'manager' && !domainTouched.value) domain.value = domainOf(value)
})
watch(role, (value) => {
  if (value === 'manager' && !domainTouched.value) domain.value = suggestedDomain(email.value)
})

const typedDomain = computed(() => domainOf(email.value))
// A manager guest inviting outside their domain is asking, not inviting.
const asking = computed(() => authority.value === 'guest-manager' && Boolean(typedDomain.value) && typedDomain.value !== myDomain.value)

const canSend = computed(() => {
  if (!email.value.includes('@') || inviting.value) return false
  return !asking.value || reason.value.trim().length >= 3
})

async function invite() {
  if (!canSend.value) return
  inviting.value = true
  inviteError.value = ''
  lastInvite.value = null
  try {
    const answer = await untypedFetch<InviteAnswer>(`${base.value}/guests/invitations`, {
      method: 'POST',
      headers: realtimeHeaders(),
      body: {
        email: email.value,
        role: authority.value === 'admin' ? role.value : 'editor',
        allowedDomain: authority.value === 'admin' && role.value === 'manager' ? domain.value : undefined,
        reason: asking.value ? reason.value : undefined
      }
    })
    lastInvite.value = answer
    email.value = ''
    reason.value = ''
    domainTouched.value = false
    domain.value = ''
    await loadListing()
  } catch (e) {
    inviteError.value = errorMessage(e, 'Could not invite that person')
  } finally {
    inviting.value = false
  }
}

async function copy(text: string, title = 'Link copied') {
  await navigator.clipboard.writeText(text)
  toast.add({ title, icon: 'i-lucide-clipboard-check', duration: 2000 })
}

// ─── Guests and invitations ────────────────────────────────

const busy = ref('')

async function act(key: string, run: () => Promise<unknown>, failure: string) {
  busy.value = key
  try {
    await run()
    await loadListing()
  } catch (e) {
    toast.add({ title: errorMessage(e, failure), icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    busy.value = ''
  }
}

const GUEST_LABEL: Record<GuestRole, string> = { editor: 'Editor', manager: 'Manager guest' }

function changeGuestRole(guest: Guest, next: GuestRole) {
  if (guest.role === next) return
  // A manager guest keeps their domain when switched back later; the server drops it for an editor.
  return act(`g:${guest.userId}`, () => untypedFetch(`${base.value}/guests/${guest.userId}`, {
    method: 'PUT', headers: realtimeHeaders(), body: { role: next, allowedDomain: next === 'manager' ? (guest.allowedDomain ?? suggestedDomain(guest.email)) : null }
  }), 'Could not change the role')
}

const editingDomain = ref<string | null>(null)
const domainDraft = ref('')
function startDomain(guest: Guest) {
  editingDomain.value = guest.userId
  domainDraft.value = guest.allowedDomain ?? suggestedDomain(guest.email)
}
async function saveDomain(guest: Guest) {
  const value = domainDraft.value
  editingDomain.value = null
  await act(`g:${guest.userId}`, () => untypedFetch(`${base.value}/guests/${guest.userId}`, {
    method: 'PUT', headers: realtimeHeaders(), body: { allowedDomain: value }
  }), 'Could not save the domain')
}

const removing = ref<string | null>(null)
function removeGuest(guest: Guest) {
  if (removing.value !== guest.userId) {
    removing.value = guest.userId
    return
  }
  removing.value = null
  return act(`g:${guest.userId}`, () => untypedFetch(`${base.value}/guests/${guest.userId}`, { method: 'DELETE', headers: realtimeHeaders() }), 'Could not remove the guest')
}

function withdraw(invitation: Invitation) {
  return act(`i:${invitation.id}`, () => untypedFetch(`${base.value}/guests/invitations/${invitation.id}`, { method: 'DELETE', headers: realtimeHeaders() }), 'Could not withdraw that')
}

const approvedLink = ref<{ email: string, url: string, emailed: boolean } | null>(null)
async function decide(invitation: Invitation, approve: boolean) {
  await act(`i:${invitation.id}`, async () => {
    const answer = await untypedFetch<{ url?: string, emailed?: boolean }>(`${base.value}/guests/invitations/${invitation.id}/${approve ? 'approve' : 'decline'}`, {
      method: 'POST', headers: realtimeHeaders(), body: {}
    })
    if (approve && answer?.url) approvedLink.value = { email: invitation.email, url: answer.url, emailed: Boolean(answer.emailed) }
  }, 'Could not decide that')
}

const mine = (invitation: Invitation) => invitation.invitedBy === session.value?.user.id
const teamName = computed(() => activeTeam.value?.name ?? '')

function staffBadge(person: StaffPerson): string {
  if (person.isProjectOwner) return 'Owner'
  if (person.role === 'manager' && !person.explicit) return `Team ${person.teamRole}`
  if (person.role === 'manager') return 'Manager'
  if (person.role === 'member') return 'Member'
  return 'Can see board'
}

const boardLink = computed(() => (import.meta.client ? `${window.location.origin}/projects/${props.projectId}` : ''))
const canOpen = computed(() => authority.value === 'admin' || authority.value === 'guest-manager')
const stack = computed(() => people.value.slice(0, 4))
const overflow = computed(() => Math.max(0, people.value.length - stack.value.length))
const waitingCount = computed(() => listing.value?.invitations.filter(i => i.status === 'awaiting_approval').length ?? 0)

const boardWatch = useBoardWatch(() => props.projectId)

// Last, so everything they touch is declared by the time the immediate run happens.
watch(() => props.projectId, () => {
  listing.value = null
  staff.value = []
  lastInvite.value = null
  loadListing()
}, { immediate: true })
watch(open, (isOpen) => {
  if (isOpen) {
    loadListing()
    boardWatch.load()
  }
})
</script>

<template>
  <!-- Not allowed to share: a team member keeps the public link, an outside reader gets nothing. -->
  <template v-if="authority === 'none'">
    <slot
      v-if="!outsideReader"
      name="fallback"
    />
  </template>

  <div
    v-else-if="canOpen"
    class="flex items-center gap-2"
  >
    <button
      v-if="people.length"
      type="button"
      class="flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary max-sm:hidden"
      aria-label="Who has access"
      data-share-stack
      @click="open = true"
    >
      <span class="flex -space-x-1.5">
        <PersonCard
          v-for="person in stack"
          :key="person.id"
          :person-id="person.id"
          :name="person.name"
          :image="person.image"
        >
          <UAvatar
            :src="person.image ?? undefined"
            :alt="person.name"
            size="2xs"
            class="ring-2 ring-default"
          />
        </PersonCard>
      </span>
      <span
        v-if="overflow"
        class="ml-1 text-xs text-muted"
      >+{{ overflow }}</span>
    </button>

    <UButton
      icon="i-lucide-lock"
      size="xs"
      color="primary"
      aria-label="Share board"
      data-share-open
      @click="open = true"
    >
      <span>Share</span>
      <span
        v-if="waitingCount && authority === 'admin'"
        class="rounded-full bg-white/25 px-1.5 text-[10px] tabular-nums"
      >{{ waitingCount }}</span>
    </UButton>

    <UModal
      v-model:open="open"
      :title="`Share ${projectName}`"
      description="Choose who can see this board."
      :ui="{ content: 'max-w-lg' }"
    >
      <template #body>
        <div
          class="space-y-6"
          data-share-dialog
        >
          <section class="space-y-2">
            <h3 class="text-sm font-semibold text-default">
              Invite with email
            </h3>
            <form
              class="flex flex-wrap items-start gap-2"
              @submit.prevent="invite"
            >
              <UInput
                v-model="email"
                type="email"
                placeholder="Add a guest by email…"
                class="min-w-0 flex-1"
                data-share-email
              />
              <select
                v-if="authority === 'admin'"
                v-model="role"
                class="rounded-md border border-default bg-transparent px-2 py-1.5 text-sm text-default outline-none focus:border-primary"
                aria-label="Guest role"
                data-share-role
              >
                <option value="editor">
                  Editor
                </option>
                <option value="manager">
                  Manager guest
                </option>
              </select>
              <UButton
                type="submit"
                :label="asking ? 'Ask' : 'Invite'"
                :disabled="!canSend"
                :loading="inviting"
                data-share-invite
              />
            </form>

            <UFormField
              v-if="authority === 'admin' && role === 'manager'"
              label="Domain this manager guest may invite at"
              help="Your whitelist: they invite people at this company domain straight away and must ask you for anyone else. Public mail providers like gmail.com cannot be whitelisted."
            >
              <UInput
                v-model="domain"
                placeholder="superfabulousshop.com"
                class="w-full"
                data-share-domain
                @input="domainTouched = true"
              />
            </UFormField>

            <UFormField
              v-if="asking"
              label="Why should this person be invited?"
              :help="`${typedDomain} is not your domain, so a project admin has to approve it.`"
            >
              <UTextarea
                v-model="reason"
                :rows="2"
                class="w-full"
                data-share-reason
              />
            </UFormField>

            <label class="flex items-center gap-2 pt-1 text-sm text-default">
              <input
                type="checkbox"
                class="size-4 accent-primary"
                :checked="boardWatch.watching.value"
                :disabled="boardWatch.saving.value"
                data-share-watch
                @change="boardWatch.set(($event.target as HTMLInputElement).checked)"
              >
              Notify me when tasks are added to the project
            </label>

            <p
              v-if="authority === 'guest-manager' && !asking"
              class="text-xs text-muted"
            >
              You can invite people at {{ myDomain ?? 'your domain' }} straight away.
            </p>
            <p
              v-if="inviteError"
              class="text-xs text-error"
              data-share-error
            >
              {{ inviteError }}
            </p>

            <div
              v-if="lastInvite && lastInvite.status === 'awaiting_approval'"
              class="rounded-md bg-elevated px-3 py-2 text-xs text-default"
              data-share-requested
            >
              Sent to the project admins. {{ lastInvite.email }} is invited once one of them approves it.
            </div>
            <div
              v-else-if="lastInvite?.url"
              class="space-y-1.5 rounded-md bg-elevated px-3 py-2"
              data-share-link
            >
              <p class="text-xs text-default">
                {{ lastInvite.emailed ? `Invitation mailed to ${lastInvite.email}.` : `Send this link to ${lastInvite.email}. It works for that address only.` }}
              </p>
              <div class="flex items-center gap-2">
                <code class="min-w-0 flex-1 truncate rounded bg-default px-2 py-1 text-xs">{{ lastInvite.url }}</code>
                <UButton
                  label="Copy"
                  icon="i-lucide-copy"
                  size="xs"
                  color="neutral"
                  variant="soft"
                  @click="copy(lastInvite.url!)"
                />
              </div>
            </div>
          </section>

          <section
            v-if="!outsideReader"
            class="space-y-2"
          >
            <h3 class="text-sm font-semibold text-default">
              Access settings
            </h3>
            <div class="flex items-start gap-2 rounded-lg border border-default px-3 py-2.5">
              <UIcon
                name="i-lucide-lock"
                class="mt-0.5 size-4 shrink-0 text-muted"
              />
              <p class="text-sm text-muted">
                {{ teamName ? `Everyone on ${teamName} can see this board.` : 'Only you can see this board.' }}
                Guests see only what is not marked private.
              </p>
            </div>
            <div class="flex items-center justify-between rounded-lg border border-default px-3 py-2">
              <span class="text-sm text-default">Public link</span>
              <SharePopover
                subject="board"
                :label="isPublic ? 'On' : 'Off'"
                :is-public="isPublic"
                :public-until="publicUntil"
                :link="publicLink"
                :save="saveSharing"
              />
            </div>
          </section>

          <section class="space-y-2">
            <h3 class="text-sm font-semibold text-default">
              Who has access
            </h3>

            <div
              v-if="approvedLink"
              class="space-y-1.5 rounded-md bg-elevated px-3 py-2"
              data-share-approved
            >
              <p class="text-xs text-default">
                {{ approvedLink.emailed ? `${approvedLink.email} got the invitation by email.` : `Send this link to ${approvedLink.email}.` }}
              </p>
              <div class="flex items-center gap-2">
                <code class="min-w-0 flex-1 truncate rounded bg-default px-2 py-1 text-xs">{{ approvedLink.url }}</code>
                <UButton
                  label="Copy"
                  icon="i-lucide-copy"
                  size="xs"
                  color="neutral"
                  variant="soft"
                  @click="copy(approvedLink.url)"
                />
              </div>
            </div>

            <ul class="divide-y divide-default overflow-hidden rounded-lg border border-default">
              <li
                v-for="person in staff"
                :key="person.id"
                class="flex items-center gap-3 px-3 py-2"
                data-share-staff
              >
                <PersonCard
                  :person-id="person.id"
                  :name="person.name"
                  :image="person.image"
                >
                  <UAvatar
                    :src="person.image ?? undefined"
                    :alt="person.name"
                    size="sm"
                  />
                </PersonCard>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm text-default">
                    {{ person.name }}
                  </p>
                  <p class="truncate text-xs text-muted">
                    {{ person.email }}
                  </p>
                </div>
                <span class="shrink-0 text-xs text-muted">{{ staffBadge(person) }}</span>
              </li>

              <li
                v-for="guest in listing?.guests ?? []"
                :key="guest.userId"
                class="px-3 py-2"
                data-share-guest
              >
                <div class="flex items-center gap-3">
                  <PersonCard
                    :person-id="guest.userId"
                    :name="guest.name"
                    :image="guest.image"
                  >
                    <UAvatar
                      :src="guest.image ?? undefined"
                      :alt="guest.name"
                      size="sm"
                    />
                  </PersonCard>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm text-default">
                      {{ guest.name }}
                      <span class="ml-1 rounded bg-elevated px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">Guest</span>
                    </p>
                    <p class="truncate text-xs text-muted">
                      {{ guest.email }}
                    </p>
                  </div>
                  <select
                    v-if="authority === 'admin'"
                    :value="guest.role"
                    class="shrink-0 rounded-md border border-default bg-transparent px-1.5 py-1 text-xs text-default outline-none focus:border-primary"
                    :disabled="busy === `g:${guest.userId}`"
                    :aria-label="`Role of ${guest.name}`"
                    @change="changeGuestRole(guest, ($event.target as HTMLSelectElement).value as GuestRole)"
                  >
                    <option value="editor">
                      Editor
                    </option>
                    <option value="manager">
                      Manager guest
                    </option>
                  </select>
                  <span
                    v-else
                    class="shrink-0 text-xs text-muted"
                  >{{ GUEST_LABEL[guest.role] }}</span>
                  <button
                    v-if="authority === 'admin'"
                    type="button"
                    class="shrink-0 text-xs"
                    :class="removing === guest.userId ? 'font-medium text-error' : 'text-dimmed hover:text-error'"
                    :aria-label="`Remove ${guest.name}`"
                    @click="removeGuest(guest)"
                    @blur="removing = null"
                  >
                    {{ removing === guest.userId ? 'Remove?' : '✕' }}
                  </button>
                </div>
                <div
                  v-if="guest.role === 'manager' && authority === 'admin'"
                  class="mt-1.5 flex items-center gap-2 pl-10 text-xs text-muted"
                >
                  <span>May invite at</span>
                  <template v-if="editingDomain === guest.userId">
                    <input
                      v-model="domainDraft"
                      class="w-44 rounded-md border border-default bg-transparent px-1.5 py-0.5 text-xs outline-none focus:border-primary"
                      placeholder="superfabulousshop.com"
                      @keydown.enter.prevent="saveDomain(guest)"
                      @keydown.escape="editingDomain = null"
                      @blur="saveDomain(guest)"
                    >
                  </template>
                  <button
                    v-else
                    type="button"
                    class="rounded bg-elevated px-1.5 py-0.5 text-default hover:bg-accented"
                    data-share-domain-edit
                    @click="startDomain(guest)"
                  >
                    {{ guest.allowedDomain ?? 'no domain' }}
                  </button>
                </div>
              </li>

              <li
                v-for="invitation in listing?.invitations ?? []"
                :key="invitation.id"
                class="px-3 py-2"
                :data-share-invitation="invitation.status"
              >
                <div class="flex items-center gap-3">
                  <span class="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-default text-muted">
                    <UIcon
                      name="i-lucide-mail"
                      class="size-4"
                    />
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm text-default">
                      {{ invitation.email }}
                    </p>
                    <p class="truncate text-xs text-muted">
                      {{ invitation.status === 'awaiting_approval' ? `Waiting for approval · asked by ${invitation.invitedByName ?? 'a manager guest'}` : `Invited as ${GUEST_LABEL[invitation.role].toLowerCase()}` }}
                    </p>
                  </div>
                  <template v-if="invitation.status === 'awaiting_approval' && authority === 'admin'">
                    <UButton
                      label="Approve"
                      size="xs"
                      :loading="busy === `i:${invitation.id}`"
                      data-share-approve
                      @click="decide(invitation, true)"
                    />
                    <UButton
                      label="Decline"
                      size="xs"
                      color="neutral"
                      variant="soft"
                      :disabled="busy === `i:${invitation.id}`"
                      @click="decide(invitation, false)"
                    />
                  </template>
                  <UButton
                    v-else-if="authority === 'admin' || mine(invitation)"
                    label="Withdraw"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :disabled="busy === `i:${invitation.id}`"
                    @click="withdraw(invitation)"
                  />
                </div>
                <p
                  v-if="invitation.reason && invitation.status === 'awaiting_approval'"
                  class="mt-1 pl-11 text-xs text-muted"
                >
                  “{{ invitation.reason }}”
                </p>
              </li>
            </ul>
            <p
              v-if="loadingList && !listing"
              class="text-xs text-muted"
            >
              Loading…
            </p>
          </section>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-end">
          <UButton
            label="Copy board link"
            icon="i-lucide-link"
            color="neutral"
            variant="outline"
            size="sm"
            @click="copy(boardLink)"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
