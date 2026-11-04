<script setup lang="ts">
// The two dialogs that start or join a team. Managing the team itself lives on /team.
const props = defineProps<{
  createOpen?: boolean
  joinOpen?: boolean
}>()

const emit = defineEmits<{
  'update:createOpen': [value: boolean]
  'update:joinOpen': [value: boolean]
}>()

const { createTeam, joinTeamWithCode } = useTeams()
const { refresh: refreshProjects } = useProjects()
const { refresh: refreshCustomers } = useCustomers()

const isCreateOpen = computed({
  get: () => props.createOpen ?? false,
  set: val => emit('update:createOpen', val)
})

const isJoinOpen = computed({
  get: () => props.joinOpen ?? false,
  set: val => emit('update:joinOpen', val)
})

// Create Team form
const newTeamName = ref('')
const createLoading = ref(false)
const createError = ref('')

// Join a team with a code form
const joinCodeInput = ref('')
const joinLoading = ref(false)
const joinError = ref('')
const joinInput = ref<{ inputRef?: HTMLInputElement | null } | null>(null)

async function handleJoinTeam() {
  if (!joinCodeInput.value.trim()) return
  joinLoading.value = true
  joinError.value = ''
  try {
    await joinTeamWithCode(joinCodeInput.value.trim())
    joinCodeInput.value = ''
    isJoinOpen.value = false
    await refreshProjects()
    await refreshCustomers()
  } catch (e: unknown) {
    // 404 is the server's wrong-code answer; anything else is a failure to reach it.
    const status = (e as { statusCode?: number })?.statusCode
    joinError.value = status === 404
      ? 'That code is not valid. Ask the team owner for a new one.'
      : 'Could not join. Try again.'
    // The code stays in the field, so the person can fix it without clicking.
    await nextTick()
    joinInput.value?.inputRef?.focus()
  } finally {
    joinLoading.value = false
  }
}

async function handleCreateTeam() {
  if (!newTeamName.value.trim()) return
  createLoading.value = true
  createError.value = ''
  try {
    await createTeam(newTeamName.value.trim())
    newTeamName.value = ''
    isCreateOpen.value = false
    // Creating a team switches the active workspace, so the board list is stale.
    await refreshProjects()
    await refreshCustomers()
  } catch (e: unknown) {
    createError.value = (e as Error)?.message || 'Failed to create team'
  } finally {
    createLoading.value = false
  }
}
</script>

<template>
  <div>
    <!-- Create Team Modal -->
    <UModal
      v-model:open="isCreateOpen"
      title="Create New Team"
      description="Collaborate on boards with your teammates."
    >
      <template #body>
        <form
          class="space-y-4"
          @submit.prevent="handleCreateTeam"
        >
          <UFormField
            label="Team Name"
            required
          >
            <UInput
              v-model="newTeamName"
              placeholder="e.g. Acme Engineering"
              class="w-full"
              required
            />
          </UFormField>

          <UAlert
            v-if="createError"
            color="error"
            variant="subtle"
            :description="createError"
          />

          <div class="flex justify-end gap-2 pt-2">
            <UButton
              color="neutral"
              variant="soft"
              @click="isCreateOpen = false"
            >
              Cancel
            </UButton>
            <UButton
              type="submit"
              color="primary"
              :loading="createLoading"
            >
              Create Team
            </UButton>
          </div>
        </form>
      </template>
    </UModal>

    <!-- Join a team with a code modal -->
    <UModal
      v-model:open="isJoinOpen"
      title="Join a team with a code"
      description="Enter a team code shared by a teammate to join."
    >
      <template #body>
        <form
          class="space-y-4"
          @submit.prevent="handleJoinTeam"
        >
          <UFormField
            label="Team Code"
            hint="Enter the join code shared by a teammate"
            required
          >
            <UInput
              ref="joinInput"
              v-model="joinCodeInput"
              placeholder="e.g. K3F9QX7BM2H8YRWZ"
              class="w-full font-mono uppercase"
              required
            />
          </UFormField>

          <UAlert
            v-if="joinError"
            color="error"
            variant="subtle"
            :description="joinError"
          />

          <div class="flex justify-end gap-2 pt-2">
            <UButton
              color="neutral"
              variant="soft"
              @click="isJoinOpen = false"
            >
              Cancel
            </UButton>
            <UButton
              type="submit"
              color="primary"
              :loading="joinLoading"
            >
              Join a team with a code
            </UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
