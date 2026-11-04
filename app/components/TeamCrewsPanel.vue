<script setup lang="ts">
import { attachTeamCrew, detachTeamCrew, listTeamCrews } from '~/composables/useTeamCrews'
import type { TeamCrewLink, TeamCrewsList } from '~/composables/useTeamCrews'

// The crews working on this team's boards. Each one keeps a shadow board of its own, in its own
// team, for the board it works on. It reads the real board and never writes to it: the results
// are carried over by whoever runs the crew. Owners and admins give a board a crew, and only one
// they made themselves.
const props = defineProps<{ teamId: string }>()

const toast = useToast()
const route = useRoute()

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
    <p class="text-xs text-muted">
      A crew that works on a board keeps a board of its own for it, in its own team. It reads this board and never changes it; the results are carried over by whoever runs the crew.
    </p>

    <form
      v-if="data?.canAttach"
      class="space-y-2 rounded-xl border border-default p-3"
      data-team-crew-form
      @submit.prevent="give"
    >
      <p class="text-xs font-semibold uppercase tracking-wide text-muted">
        Give a board a crew
      </p>
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
            :to="`/projects/${link.shadowProjectId}`"
            size="xs"
            color="neutral"
            variant="soft"
            icon="i-lucide-arrow-up-right"
            data-team-crew-open
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
  </div>
</template>
