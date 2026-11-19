<script setup lang="ts">
import { entryFor, firstRedirect, mayShowFirstProjectForm, redirectPending, sharedDecided } from '~/utils/projectsEntry'
import { selectTeamOrStay, teamRedirectAllowed, teamToOpenFor } from '~/utils/teamEntry'
import { pendingInviteEntry } from '~/utils/pendingInviteEntry'
import { autoClaimDue, claimableCount, pendingInvitationEntry } from '~/utils/pendingInvitationEntry'

definePageMeta({ layout: 'app' })

const { ready, projects, createProject } = useProjects()
const { teams, activeTeamId, setActiveTeam, refreshTeamList, isPending: teamsPending } = useTeams()
const route = useRoute()

// A customer contact or guest with no team and no board goes to the shared list, not to the first-project form.
const { data: sharedData, status: sharedStatus } = useFetch<{ contact: boolean, inviteToken: string | null }>('/api/shared-with-me', { key: 'shared-with-me', server: false, lazy: true })
const contactOnlyEntry = computed(() => !teamsPending.value && ready.value && sharedData.value
  ? entryFor({ asksNew: route.query.new === '1', hasProjects: projects.value.length > 0, teamCount: teams.value.length, contact: sharedData.value.contact })
  : null)
// Someone who signed up from an invitation link and never pressed Accept goes back to that invitation.
const inviteEntry = computed(() => !teamsPending.value && ready.value && sharedData.value
  ? pendingInviteEntry({ asksNew: route.query.new === '1', hasProjects: projects.value.length > 0, teamCount: teams.value.length, inviteToken: sharedData.value.inviteToken })
  : null)

// Invitations sent to this account's address that it has not accepted: a later sign-in shows them, with Accept invitation.
const { data: pendingData } = useFetch<{ invitations: unknown[], claimable?: number }>('/api/pending-invitations', { key: 'pending-invitations', server: false, lazy: true })
// The owner's rule: an invitation tied to the signed-in verified address is accepted by itself, once, here. Until that is
// done, nothing is sent to the pending page, so the Accept button does not show for a tied invitation. That covers the
// team and board invitations too (`claimable`), so an account with only one of those is claimed here as well.
const autoClaiming = ref(false)
const autoClaimed = ref(false)
watch(() => autoClaimDue({
  ready: ready.value,
  teamsPending: teamsPending.value,
  pendingCount: claimableCount(pendingData.value),
  done: autoClaimed.value || autoClaiming.value
}), async (due) => {
  if (!due) return
  autoClaiming.value = true
  try {
    await $fetch('/api/pending-invitations/claim', { method: 'POST' })
  } catch {
    // Nothing to show here: whatever is left stays on the pending page.
  }
  autoClaimed.value = true
  autoClaiming.value = false
  // A team accepted here must show in the team list at once, so the team entry below can open it.
  await Promise.all([refreshNuxtData('pending-invitations'), refreshNuxtData('shared-with-me'), refreshTeamList()])
}, { immediate: true })

const pendingEntry = computed(() => autoClaimed.value && !teamsPending.value && ready.value && pendingData.value
  ? pendingInvitationEntry({ asksNew: route.query.new === '1', hasProjects: projects.value.length > 0, teamCount: teams.value.length, pendingCount: pendingData.value.invitations.length })
  : null)

// One navigation at a time (see firstRedirect): a link from the address first, then the pending list, then the shared list.
watch(() => firstRedirect(contactOnlyEntry.value, inviteEntry.value ?? pendingEntry.value), (path) => {
  if (path) navigateTo(path, { replace: true })
}, { immediate: true })

// A team member who signs in again in a new browser starts in the personal workspace, which is empty: open their team.
const teamEntry = computed(() => !teamsPending.value && ready.value && teamRedirectAllowed({
  contactTarget: contactOnlyEntry.value ?? pendingEntry.value,
  inviteTarget: inviteEntry.value
})
  ? teamToOpenFor({
      asksNew: route.query.new === '1',
      hasProjects: projects.value.length > 0,
      activeTeamId: activeTeamId.value,
      teamIds: teams.value.map(team => team.id)
    })
  : null)
// Set when selecting the team failed: the person then stays in the personal workspace, and the form may show.
const teamSelectFailed = ref(false)
watch(teamEntry, async (teamId) => {
  if (!teamId) return
  // If the team cannot be selected, the person stays in the personal workspace; nothing is thrown.
  const selected = await selectTeamOrStay(setActiveTeam, teamId)
  if (!selected) {
    teamSelectFailed.value = true
    return
  }
  // A full load, so the projects store picks up the team's boards.
  await navigateTo('/projects', { replace: true, external: true })
}, { immediate: true })

// Land on the most recently updated board.
// ?new=1 (the sidebar's new-project button) keeps you here to name one.
const wantsNew = computed(() => route.query.new === '1')

watch([ready, wantsNew], ([isReady]) => {
  if (!isReady || wantsNew.value) return
  const top = projects.value[0]
  if (top) navigateTo(`/projects/${top.id}`, { replace: true })
}, { immediate: true })

// A frame of this page while a redirect is pending reads as a flash of "no
// projects", so nothing paints until we know there is nothing to open.
// The form waits until the page has decided it stays here (see mayShowFirstProjectForm), so it never flashes first.
const showEmptyState = computed(() => mayShowFirstProjectForm({
  ready: ready.value,
  teamsPending: teamsPending.value,
  sharedLoaded: sharedDecided(sharedStatus.value),
  redirecting: redirectPending(contactOnlyEntry.value, false) || redirectPending(inviteEntry.value, false) || redirectPending(pendingEntry.value, false) || redirectPending(teamEntry.value, teamSelectFailed.value)
}) && (projects.value.length === 0 || wantsNew.value))

const name = ref('')
const creating = ref(false)
const nameEl = ref<HTMLInputElement | null>(null)

watch(showEmptyState, async (show) => {
  if (!show) return
  await nextTick()
  nameEl.value?.focus()
}, { immediate: true })

async function handleCreate() {
  const value = name.value.trim()
  if (!value || creating.value) return
  creating.value = true
  try {
    const project = await createProject(value)
    name.value = ''
    navigateTo(`/projects/${project.id}`)
  } finally {
    creating.value = false
  }
}

function cancel() {
  name.value = ''
  const top = projects.value[0]
  navigateTo(top ? `/projects/${top.id}` : '/projects', { replace: true })
}
</script>

<template>
  <div class="flex min-w-0 flex-1 flex-col">
    <Teleport
      defer
      to="#app-topbar-title"
    >
      <span class="text-base font-semibold text-default">Projects</span>
    </Teleport>

    <div
      v-if="!showEmptyState"
      class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-5 animate-spin text-muted"
      />
      <p class="text-sm text-muted">
        Opening your projects…
      </p>
    </div>

    <div
      v-else
      class="flex min-h-0 flex-1 items-center justify-center px-6"
    >
      <div class="w-full max-w-sm">
        <div class="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <UIcon
            name="i-lucide-kanban"
            class="size-5"
          />
        </div>
        <h1 class="mt-4 text-lg font-semibold text-default">
          {{ wantsNew ? 'New project' : 'Your first project' }}
        </h1>
        <p class="mt-1 text-sm text-muted">
          Boards start with Backlog, To do, Verify and Done. Rename, reorder or remove columns anytime.
        </p>

        <form
          class="mt-5 flex items-center gap-2"
          @submit.prevent="handleCreate"
        >
          <input
            ref="nameEl"
            v-model="name"
            placeholder="Project name"
            class="min-w-0 flex-1 rounded-lg border border-default bg-default px-3 py-2 text-sm text-default outline-none transition-colors focus:border-primary placeholder:text-dimmed"
            @keydown.escape="cancel"
          >
          <UButton
            type="submit"
            label="Create"
            color="primary"
            :loading="creating"
            :disabled="!name.trim()"
          />
        </form>

        <button
          v-if="wantsNew && projects.length"
          class="mt-3 text-xs text-muted transition-colors hover:text-default"
          @click="cancel"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>
