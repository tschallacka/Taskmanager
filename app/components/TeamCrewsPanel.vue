<script setup lang="ts">
import { detachTeamCrew, listTeamCrews } from '~/composables/useTeamCrews'
import type { TeamCrewLink, TeamCrewsList } from '~/composables/useTeamCrews'

// The crews working on this team's boards. Each one keeps a shadow board of its own, in its own
// team, for the board it works on. It reads the real board and never writes to it: the results
// are carried over by whoever runs the crew. Owners and admins add a crew to a board: always a new
// crew, made by an AI agent with a 10-minute management token.
const props = defineProps<{ teamId: string }>()

const toast = useToast()
const { switchWorkspace } = useWorkspace()

const data = ref<TeamCrewsList | null>(null)
const loading = ref(false)
const projectId = ref('')
// The board whose "Add a crew to this board" window is open.
const managementBoard = ref<{ id: string, name: string } | null>(null)
const confirmDetach = ref<TeamCrewLink | null>(null)
const detaching = ref(false)

function errMsg(e: unknown, fallback: string): string {
  return (e as { data?: { message?: string } })?.data?.message || (e as Error)?.message || fallback
}

function fail(e: unknown, fallback: string) {
  toast.add({ title: errMsg(e, fallback), icon: 'i-lucide-alert-triangle', color: 'error' })
}

// The team level of the crew permission. Only owners and admins get it; a member gets none and sees no switch.
const teamPermission = ref<{ crewsAllowed: boolean, instanceAllowed: boolean } | null>(null)
const savingPermission = ref(false)

async function loadTeamPermission() {
  try {
    teamPermission.value = await $fetch<{ crewsAllowed: boolean, instanceAllowed: boolean }>(`/api/teams/${props.teamId}/crews-allowed`)
  } catch {
    teamPermission.value = null
  }
}

async function setTeamCrews(allowed: boolean) {
  savingPermission.value = true
  try {
    await $fetch(`/api/teams/${props.teamId}/crews-allowed`, { method: 'PUT', body: { crewsAllowed: allowed } })
    await loadTeamPermission()
    toast.add({
      title: allowed ? 'Crews may be made for this team\'s boards' : 'Crews are off for this team',
      description: allowed ? undefined : 'The crews on its boards are disabled. A rotate turns one back on.',
      icon: 'i-lucide-check'
    })
  } catch (e) {
    fail(e, 'Could not save the setting')
  } finally {
    savingPermission.value = false
  }
}

async function load() {
  loading.value = true
  loadTeamPermission()
  try {
    data.value = await listTeamCrews(props.teamId)
  } catch (e) {
    fail(e, 'Could not load the crews')
  } finally {
    loading.value = false
  }
}

watch(() => props.teamId, () => {
  projectId.value = ''
  load()
}, { immediate: true })

const links = computed(() => data.value?.links ?? [])
const canAdd = computed(() => Boolean(projectId.value))

// The board picked above opens the management token window for it. The agent it is given to makes a new crew there.
function addCrew() {
  const board = data.value?.boards.find(b => b.id === projectId.value)
  if (board) managementBoard.value = { id: board.id, name: board.name }
}

// When the window closes, the list is read again so a crew made meanwhile shows up.
function onManagementOpen(open: boolean) {
  if (open) return
  managementBoard.value = null
  projectId.value = ''
  load()
}

async function detach() {
  const link = confirmDetach.value
  if (!link) return
  detaching.value = true
  try {
    await detachTeamCrew(props.teamId, link.id)
    confirmDetach.value = null
    await load()
  } catch (e) {
    fail(e, 'Could not take the crew off the board')
  } finally {
    detaching.value = false
  }
}

// A member of the crew's team works on its board in that team's workspace, as a pinned board does.
// Everyone else on this team reads it from here: the server refuses anything but reads.
async function openCrewBoard(link: TeamCrewLink) {
  if (link.inCrewTeam) await switchWorkspace(link.crewTeamId)
  await navigateTo(`/projects/${link.shadowProjectId}`)
}

const isDetachOpen = computed({
  get: () => confirmDetach.value !== null,
  set: (open) => {
    if (!open) confirmDetach.value = null
  }
})

const SELECT_CLASS = 'min-w-0 flex-1 rounded-md border border-default bg-default px-2 py-1.5 text-sm text-default outline-none focus:border-primary'
</script>

<template>
  <div
    class="space-y-4"
    data-team-crews
  >
    <!-- The team level: off until an owner or admin allows crews for this team's boards. -->
    <div
      v-if="teamPermission"
      class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-default p-3"
      data-team-crews-allowed
    >
      <div>
        <p class="text-sm font-medium text-default">
          Crews may be made for this team's boards
        </p>
        <p class="text-xs text-muted">
          <template v-if="!teamPermission.instanceAllowed">
            Your admin has not allowed crews on this instance, so this cannot be turned on yet.
          </template>
          <template v-else>
            Off until you turn it on. Each board needs its own switch as well, in the board's settings.
          </template>
        </p>
      </div>
      <USwitch
        :model-value="teamPermission.crewsAllowed"
        :disabled="savingPermission || (!teamPermission.instanceAllowed && !teamPermission.crewsAllowed)"
        aria-label="Crews may be made for this team's boards"
        @update:model-value="setTeamCrews"
      />
    </div>

    <RateLimitFields
      v-if="teamPermission"
      :url="`/api/teams/${teamId}/rate-limits`"
      title="Rate limits for this team's boards"
      hint="At most this many of each in the window, on top of the instance's limit."
    />

    <p class="text-xs text-muted">
      A crew that works on a board keeps a board of its own for it, in its own team. It reads this board and never changes it; the results are carried over by whoever runs the crew.
    </p>

    <form
      v-if="data?.canAttach"
      class="space-y-2 rounded-xl border border-default p-3"
      data-team-crew-form
      @submit.prevent="addCrew"
    >
      <p class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        Add a crew to this board
        <HelpHint page="crews/give-a-board-a-crew">
          Pick a board, then the window gives you a 10-minute token and a prompt. An AI agent with that prompt makes a new crew for the board, which gets a board of its own. It reads your board and never changes it.
        </HelpHint>
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <select
          v-model="projectId"
          :class="SELECT_CLASS"
          aria-label="Board"
          data-team-crew-board
        >
          <option
            value=""
            disabled
          >
            Pick a board
          </option>
          <option
            v-for="board in data.boards"
            :key="board.id"
            :value="board.id"
          >
            {{ board.name }}
          </option>
        </select>
        <UButton
          type="submit"
          size="sm"
          icon="i-lucide-users-round"
          :disabled="!canAdd"
          data-team-crew-add
        >
          Add a crew to this board
        </UButton>
      </div>
    </form>

    <div
      v-if="!data"
      class="py-6 text-center text-xs text-muted"
    >
      {{ loading ? 'Loading…' : 'Could not load the crews.' }}
    </div>
    <p
      v-else-if="links.length === 0"
      class="py-6 text-center text-xs text-muted"
      data-team-crews-empty
    >
      No crew works on a board of this team yet.
    </p>
    <ul
      v-else
      class="divide-y divide-default overflow-hidden rounded-xl border border-default"
    >
      <li
        v-for="link in links"
        :key="link.id"
        class="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
        data-team-crew-link
      >
        <div class="min-w-0">
          <p class="flex flex-wrap items-center gap-2 font-medium text-default">
            <span>{{ link.crewName }}</span>
            <UBadge
              v-if="link.crewDisabled"
              size="xs"
              variant="subtle"
              color="warning"
            >
              disabled
            </UBadge>
          </p>
          <p class="text-xs text-muted">
            works on
            <NuxtLink
              :to="`/projects/${link.projectId}`"
              class="text-primary hover:underline"
            >
              {{ link.projectName }}
            </NuxtLink>
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <UButton
            size="xs"
            color="neutral"
            variant="soft"
            icon="i-lucide-arrow-up-right"
            :title="link.inCrewTeam ? undefined : 'You can read the crew board, not change it.'"
            data-team-crew-open
            @click="openCrewBoard(link)"
          >
            Crew board
          </UButton>
          <UButton
            v-if="data?.canAttach"
            size="xs"
            color="error"
            variant="ghost"
            icon="i-lucide-x"
            aria-label="Take the crew off this board"
            data-team-crew-detach
            @click="confirmDetach = link"
          />
        </div>
        <div
          v-if="link.forks.length"
          class="basis-full space-y-1.5 border-t border-default pt-2"
          data-team-crew-forks
        >
          <p class="text-xs text-muted">
            Forked members already on this board:
          </p>
          <div class="flex flex-wrap gap-1.5">
            <UBadge
              v-for="forked in link.forks"
              :key="forked.key"
              size="xs"
              variant="subtle"
              color="neutral"
              data-team-crew-fork
            >
              {{ forked.agentType }}
            </UBadge>
          </div>
        </div>
      </li>
    </ul>

    <UModal
      v-model:open="isDetachOpen"
      title="Take the crew off this board?"
      :description="confirmDetach ? `${confirmDetach.crewName} stops working on ${confirmDetach.projectName}. Its own board is archived, not deleted.` : ''"
    >
      <template #body>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="soft"
            :disabled="detaching"
            @click="isDetachOpen = false"
          >
            Cancel
          </UButton>
          <UButton
            color="error"
            :loading="detaching"
            @click="detach"
          >
            Take it off
          </UButton>
        </div>
      </template>
    </UModal>

    <ManagementTokenDialog
      :open="managementBoard !== null"
      :board="managementBoard"
      @update:open="onManagementOpen"
    />
  </div>
</template>
