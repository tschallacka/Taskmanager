<script setup lang="ts">
import { EXTRA_WORKERS, attachTeamCrew, detachTeamCrew, downloadForkFile, forkTeamCrew, listTeamCrews, unforkTeamCrew } from '~/composables/useTeamCrews'
import type { ForkResult, TeamCrewLink, TeamCrewsList } from '~/composables/useTeamCrews'

// The crews working on this team's boards. Each one keeps a shadow board of its own, in its own
// team, for the board it works on. It reads the real board and never writes to it: the results
// are carried over by whoever runs the crew. Owners and admins give a board a crew, and only one
// they made themselves.
const props = defineProps<{ teamId: string }>()

const toast = useToast()
const route = useRoute()
const { switchWorkspace } = useWorkspace()

const data = ref<TeamCrewsList | null>(null)
const loading = ref(false)
const crewId = ref('')
const projectId = ref('')
const attaching = ref(false)
const confirmDetach = ref<TeamCrewLink | null>(null)
const detaching = ref(false)

function errMsg(e: unknown, fallback: string): string {
  return (e as { data?: { message?: string } })?.data?.message || (e as Error)?.message || fallback
}

function fail(e: unknown, fallback: string) {
  toast.add({ title: errMsg(e, fallback), icon: 'i-lucide-alert-triangle', color: 'error' })
}

async function load() {
  loading.value = true
  try {
    data.value = await listTeamCrews(props.teamId)
    // "Give it a crew" in a board's menu arrives with the board in the address.
    const wanted = String(route.query.board ?? '')
    if (wanted && data.value.boards.some(b => b.id === wanted)) projectId.value = wanted
    if (!crewId.value && data.value.crews.length === 1) crewId.value = data.value.crews[0]!.id
  } catch (e) {
    fail(e, 'Could not load the crews')
  } finally {
    loading.value = false
  }
}

watch(() => props.teamId, () => {
  crewId.value = ''
  projectId.value = ''
  load()
}, { immediate: true })

const links = computed(() => data.value?.links ?? [])
const canGive = computed(() => Boolean(crewId.value && projectId.value))

async function give() {
  if (!canGive.value || attaching.value) return
  attaching.value = true
  try {
    await attachTeamCrew(props.teamId, crewId.value, projectId.value)
    toast.add({ title: 'The crew has a board of its own for this one', icon: 'i-lucide-check', duration: 2500 })
    projectId.value = ''
    await load()
  } catch (e) {
    fail(e, 'Could not give the board a crew')
  } finally {
    attaching.value = false
  }
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

// ─── Members forked for a board ──────────────────────────────

const forkBusy = ref(false)
// The keys of a fork or a rotate, shown once and then dropped.
const forkResult = ref<ForkResult | null>(null)
const forkConfirm = ref<{ link: TeamCrewLink, action: 'rotate' | 'remove' } | null>(null)

async function fork(link: TeamCrewLink) {
  if (forkBusy.value) return
  forkBusy.value = true
  try {
    forkResult.value = await forkTeamCrew(props.teamId, link.id, false)
    await load()
  } catch (e) {
    fail(e, 'Could not fork the crew')
  } finally {
    forkBusy.value = false
  }
}

async function confirmForkAction() {
  const pending = forkConfirm.value
  if (!pending || forkBusy.value) return
  forkBusy.value = true
  try {
    if (pending.action === 'rotate') forkResult.value = await forkTeamCrew(props.teamId, pending.link.id, true)
    else await unforkTeamCrew(props.teamId, pending.link.id)
    forkConfirm.value = null
    await load()
  } catch (e) {
    fail(e, pending.action === 'rotate' ? 'Could not make new keys' : 'Could not remove the forks')
  } finally {
    forkBusy.value = false
  }
}

const isForkConfirmOpen = computed({
  get: () => forkConfirm.value !== null,
  set: (open) => {
    if (!open) forkConfirm.value = null
  }
})

// Extra workers added to a board that is already forked. The others keep their keys and sessions.
const addFor = ref<TeamCrewLink | null>(null)
const addPicked = ref<string[]>([])
const addBusy = ref(false)
// Set when the answer on screen holds only the workers added now, so its file is named apart from a fork's.
const forkResultAdded = ref(false)
const addableWorkers = computed(() => addFor.value
  ? EXTRA_WORKERS.filter(worker => !addFor.value!.forks.some(fork => fork.key === worker.key))
  : [])

const isAddOpen = computed({
  get: () => addFor.value !== null,
  set: (open) => {
    if (!open) addFor.value = null
  }
})

function openAdd(link: TeamCrewLink) {
  addFor.value = link
  addPicked.value = []
}

function toggleAdd(key: string, on: boolean) {
  addPicked.value = on ? [...addPicked.value, key] : addPicked.value.filter(picked => picked !== key)
}

async function addWorkers() {
  const link = addFor.value
  if (!link || !addPicked.value.length || addBusy.value) return
  addBusy.value = true
  try {
    const answer = await forkTeamCrew(props.teamId, link.id, false, addPicked.value)
    addFor.value = null
    await load()
    // Every worker asked for already has a fork here: nothing was made, so there is no file to offer.
    if (!answer.members.length) {
      toast.add({
        title: 'Those workers already have forks on this board',
        description: 'Nothing was added, so there is no file to download.',
        icon: 'i-lucide-info',
        duration: 4000
      })
      return
    }
    forkResult.value = answer
    forkResultAdded.value = true
  } catch (e) {
    fail(e, 'Could not add the workers')
    fail(e, 'Could not add the workers')
  } finally {
    addBusy.value = false
  }
}

const isForkResultOpen = computed({
  get: () => forkResult.value !== null,
  set: (open) => {
    if (!open) {
      forkResult.value = null
      forkResultAdded.value = false
    }
  }
})

// The file Boss reads the keys from: the whole answer, passwords included, as it was sent.
function downloadForks() {
  if (forkResult.value) downloadForkFile(forkResult.value, forkResultAdded.value ? '-added' : '')
}

// The guided version of the form above. "Give it a crew" in a board's menu opens it with the board chosen.
const isWizardOpen = ref(false)
let wizardAsked = false
watch(data, (loaded) => {
  if (wizardAsked || !loaded?.canAttach || route.query.wizard !== '1') return
  wizardAsked = true
  isWizardOpen.value = true
})

const SELECT_CLASS = 'min-w-0 flex-1 rounded-md border border-default bg-default px-2 py-1.5 text-sm text-default outline-none focus:border-primary'
</script>

<template>
  <div
    class="space-y-4"
    data-team-crews
  >
    <p class="text-xs text-muted">
      A crew that works on a board keeps a board of its own for it, in its own team. It reads this board and never changes it; the results are carried over by whoever runs the crew.
    </p>

    <form
      v-if="data?.canAttach"
      class="space-y-2 rounded-xl border border-default p-3"
      data-team-crew-form
      @submit.prevent="give"
    >
      <div class="flex items-center justify-between gap-2">
        <p class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          Give a board a crew
          <HelpHint page="crews/give-a-board-a-crew">
            Pick a board and a crew you made, and the crew gets a board of its own for it. It reads your board and never changes it. The step-by-step version also covers forking the members and handing over their keys.
          </HelpHint>
        </p>
        <UButton
          v-if="data.crews.length"
          size="xs"
          color="neutral"
          variant="soft"
          icon="i-lucide-list-checks"
          data-team-crew-wizard-open
          @click="isWizardOpen = true"
        >
          Step by step
        </UButton>
      </div>
      <p
        v-if="data.crews.length === 0"
        class="text-xs text-muted"
        data-team-crew-none
      >
        You have not made a crew. A crew is made on the Crews page by the instance admin, and only the person who made it can give it a board.
      </p>
      <div
        v-else
        class="flex flex-wrap items-center gap-2"
      >
        <select
          v-model="crewId"
          :class="SELECT_CLASS"
          aria-label="Crew"
          data-team-crew-pick
        >
          <option
            value=""
            disabled
          >
            Pick a crew
          </option>
          <option
            v-for="crew in data.crews"
            :key="crew.id"
            :value="crew.id"
          >
            {{ crew.name }}
          </option>
        </select>
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
          :disabled="!canGive"
          :loading="attaching"
          data-team-crew-give
        >
          Give it a crew
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
          v-if="link.mine || link.forks.length"
          class="basis-full space-y-1.5 border-t border-default pt-2"
          data-team-crew-forks
        >
          <p class="text-xs text-muted">
            <template v-if="link.forks.length">
              Members forked for this board, each with a key that reaches only the crew's board:
            </template>
            <template v-else>
              The members work for the whole crew. Fork them to give this board agents of their own, named for it, each with a key that reaches only its crew board.
            </template>
          </p>
          <div
            v-if="link.forks.length"
            class="flex flex-wrap gap-1.5"
          >
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
          <div
            v-if="link.mine"
            class="flex flex-wrap gap-2"
          >
            <UButton
              v-if="!link.forks.length"
              size="xs"
              icon="i-lucide-git-fork"
              :loading="forkBusy"
              data-team-crew-fork-new
              @click="fork(link)"
            >
              Fork the crew for this board
            </UButton>
            <template v-else>
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-lucide-refresh-cw"
                data-team-crew-fork-rotate
                @click="forkConfirm = { link, action: 'rotate' }"
              >
                New keys
              </UButton>
              <UButton
                size="xs"
                color="error"
                variant="ghost"
                icon="i-lucide-trash-2"
                data-team-crew-fork-remove
                @click="forkConfirm = { link, action: 'remove' }"
              >
                Remove the forks
              </UButton>
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-lucide-user-plus"
                data-team-crew-add-open
                @click="openAdd(link)"
              >
                Add workers
              </UButton>
            </template>
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

    <UModal
      v-model:open="isForkConfirmOpen"
      :title="forkConfirm?.action === 'rotate' ? 'Make new keys for the forks?' : 'Remove the forks?'"
      :description="forkConfirm?.action === 'rotate'
        ? 'The current keys of these agents stop working at once. You get new ones, once.'
        : 'These agents lose their accounts and keys at once. The crew stays on the board.'"
    >
      <template #body>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="soft"
            :disabled="forkBusy"
            @click="isForkConfirmOpen = false"
          >
            Cancel
          </UButton>
          <UButton
            :color="forkConfirm?.action === 'rotate' ? 'warning' : 'error'"
            :loading="forkBusy"
            data-team-crew-fork-confirm
            @click="confirmForkAction"
          >
            {{ forkConfirm?.action === 'rotate' ? 'Make new keys' : 'Remove' }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="isForkResultOpen"
      title="The forked members"
      description="Shown once. Copy the keys or download the file now, and name each agent after its agent type."
    >
      <template #body>
        <div
          class="space-y-3"
          data-team-crew-fork-result
        >
          <div class="max-h-72 divide-y divide-default overflow-y-auto rounded-lg border border-default text-xs">
            <div
              v-for="m in forkResult?.members"
              :key="m.key"
              class="space-y-0.5 px-3 py-2"
            >
              <p class="font-medium text-default">
                {{ m.agentType }}
                <span class="font-normal text-muted">({{ m.name }})</span>
              </p>
              <p class="break-all font-mono text-muted">
                {{ m.apiKey }}
              </p>
            </div>
          </div>
          <p class="text-xs text-muted">
            Each key reaches only the crew's board for this board, and reads this board. The file also holds each account's password.
          </p>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="soft"
              icon="i-lucide-download"
              data-team-crew-fork-download
              @click="downloadForks"
            >
              Download
            </UButton>
            <UButton @click="isForkResultOpen = false">
              Done
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="isAddOpen"
      title="Add workers to this board"
      description="Each extra worker gets its own account and a key that reaches only the crew's board for this board. The forks already here keep their keys and sessions."
    >
      <template #body>
        <div class="space-y-3">
          <div class="space-y-2">
            <UCheckbox
              v-for="worker in addableWorkers"
              :key="worker.key"
              :model-value="addPicked.includes(worker.key)"
              :label="worker.name"
              :data-add-worker="worker.key"
              @update:model-value="(on: boolean | 'indeterminate') => toggleAdd(worker.key, on === true)"
            />
            <p
              v-if="!addableWorkers.length"
              class="text-xs text-muted"
            >
              Every extra worker is already forked for this board.
            </p>
          </div>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="soft"
              :disabled="addBusy"
              @click="isAddOpen = false"
            >
              Cancel
            </UButton>
            <UButton
              :disabled="!addPicked.length"
              :loading="addBusy"
              data-team-crew-add-confirm
              @click="addWorkers"
            >
              Add the workers
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <CrewBoardWizard
      v-model:open="isWizardOpen"
      :team-id="teamId"
      :data="data"
      :board-id="String(route.query.board ?? '') || projectId"
      @changed="load"
    />
  </div>
</template>
