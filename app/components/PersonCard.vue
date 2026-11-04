<script setup lang="ts">
import { untypedFetch } from '~/utils/untypedFetch'

// The card that opens over a person's avatar or name: who they are, how many boards you share, and two
// things to do: give them a task, or open their profile. The server answers only for people you share a
// board with, so a stranger's card says so rather than showing anything.
export interface PersonView {
  person: { id: string, name: string, email: string | null, image: string | null }
  boards: { id: string, name: string, staff: boolean }[]
  tasks: { id: string, title: string, projectId: string, projectName: string, dueOn: string | null }[]
}

const props = defineProps<{
  /** The person the card is about. Only the id is needed; the name and picture fill in the trigger's absence. */
  personId: string
  name?: string
  image?: string | null
}>()

const { session } = useAuth()
const view = ref<PersonView | null>(null)
const failed = ref(false)
const loading = ref(false)
const draftOpen = ref(false)

const isMe = computed(() => session.value?.user.id === props.personId)
const staffBoards = computed(() => view.value?.boards.filter(board => board.staff) ?? [])

async function load() {
  if (view.value || loading.value || isMe.value) return
  loading.value = true
  try {
    view.value = await untypedFetch<PersonView>(`/api/people/${props.personId}`)
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UPopover
    mode="hover"
    :open-delay="300"
    :close-delay="150"
    :content="{ side: 'bottom', align: 'start', sideOffset: 6 }"
    @update:open="(open: boolean) => { if (open) load() }"
  >
    <span
      class="inline-flex cursor-default"
      data-person-trigger
    >
      <slot />
    </span>

    <template #content>
      <div
        class="w-72 space-y-3 p-3"
        data-person-card
      >
        <div class="flex items-center gap-3">
          <UAvatar
            :src="(view?.person.image ?? image) ?? undefined"
            :alt="view?.person.name ?? name ?? 'Person'"
            size="lg"
          />
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-default">
              {{ view?.person.name ?? name ?? 'Person' }}
            </p>
            <p
              v-if="view?.person.email"
              class="truncate text-xs text-muted"
            >
              {{ view.person.email }}
            </p>
          </div>
        </div>

        <p
          v-if="isMe"
          class="text-xs text-muted"
        >
          This is you.
        </p>
        <p
          v-else-if="loading"
          class="text-xs text-muted"
        >
          Loading…
        </p>
        <p
          v-else-if="failed"
          class="text-xs text-muted"
        >
          You do not share a board with this person.
        </p>
        <p
          v-else-if="view"
          class="text-xs text-muted"
          data-person-shared
        >
          Collaborating with you on {{ view.boards.length }} {{ view.boards.length === 1 ? 'project' : 'projects' }}
        </p>

        <div class="flex gap-2">
          <UButton
            v-if="view && staffBoards.length && !isMe"
            label="Assign task"
            icon="i-lucide-circle-check"
            size="xs"
            color="neutral"
            variant="outline"
            class="flex-1 justify-center"
            data-person-assign
            @click="draftOpen = true"
          />
          <UButton
            :to="`/people/${personId}`"
            label="View profile"
            size="xs"
            color="neutral"
            variant="outline"
            class="flex-1 justify-center"
            data-person-profile
          />
        </div>
      </div>
    </template>
  </UPopover>

  <DraftTaskModal
    v-if="view"
    v-model:open="draftOpen"
    :person="view.person"
    :boards="staffBoards"
  />
</template>
