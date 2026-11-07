<script setup lang="ts">
import { CONNECT_METHODS, permissionList } from '~/utils/connectPrompt'
import type { ConnectBoardChoice, ConnectMethod, IssuedConnection } from '~/utils/connectPrompt'

const props = defineProps<{
  boards: ConnectBoardChoice[]
  canManageCrews: boolean
  /** The board the window was opened from. Only this board is selected by default. */
  currentBoardId: string | null
}>()

const emit = defineEmits<{
  issued: [connection: IssuedConnection]
  created: []
}>()

const toast = useToast()

const EXPIRY_OPTIONS = [
  { label: 'Never expires', value: 0 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '1 year', value: 365 }
]

const NEW_TOKEN_DEFAULT: string[] = ['boards:read', 'boards:write']

const name = ref('')
const expiresInDays = ref(0)
const method = ref<ConnectMethod>('code')
const grants = ref<Record<string, string[]>>({})
const creating = ref(false)

// Only the board the window was opened from is picked; the others are picked by hand.
watch(
  () => [props.currentBoardId, props.boards.length],
  () => {
    if (props.currentBoardId && props.boards.some(board => board.id === props.currentBoardId) && !Object.keys(grants.value).length) {
      grants.value = { [props.currentBoardId]: [...NEW_TOKEN_DEFAULT] }
    }
  },
  { immediate: true }
)

const canCreate = computed(() => name.value.trim().length > 0 && name.value.trim().length <= 60 && Object.keys(grants.value).length > 0)

function boardOf(projectId: string): ConnectBoardChoice | undefined {
  return props.boards.find(board => board.id === projectId)
}

function errMsg(e: unknown): string | undefined {
  return (e as { data?: { message?: string } })?.data?.message
}

async function create() {
  if (!canCreate.value) return
  creating.value = true
  const picked = Object.entries(grants.value).map(([projectId, scopes]) => ({ projectId, scopes }))
  try {
    const response = await $fetch<{ token?: string, key: { id: string } }>('/api/settings/connect-tokens', {
      method: 'POST',
      body: {
        name: name.value.trim(),
        expiresInDays: expiresInDays.value === 0 ? null : expiresInDays.value,
        boards: picked,
        reveal: method.value === 'token' ? 'token' : undefined
      }
    })
    const boards = picked.map(pick => ({
      name: boardOf(pick.projectId)?.name ?? 'A board',
      workspace: boardOf(pick.projectId)?.workspace ?? '',
      scopes: pick.scopes
    }))
    let access: IssuedConnection['access']
    if (method.value === 'token' && response.token) {
      access = { kind: 'token', token: response.token }
    } else {
      const code = await $fetch<{ code: string, expiresAt: number }>('/api/settings/pairing-codes', {
        method: 'POST',
        body: { tokenId: response.key.id }
      })
      access = { kind: 'code', code: code.code, expiresAt: code.expiresAt }
    }
    emit('issued', { title: 'Connection ready', tokenName: name.value.trim(), boards, access })
    name.value = ''
    grants.value = {}
    emit('created')
  } catch (e) {
    toast.add({ title: 'Could not make the connection', description: errMsg(e), icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    creating.value = false
  }
}

const summary = computed(() => {
  const picked = Object.entries(grants.value)
  if (!picked.length) return 'Pick at least one board.'
  return picked.map(([projectId, scopes]) => `${boardOf(projectId)?.name ?? 'A board'}: ${permissionList(scopes)}`).join(' · ')
})
</script>

<template>
  <div class="space-y-5">
    <div class="space-y-2">
      <p class="text-sm font-medium">
        Name it
      </p>
      <UInput
        v-model="name"
        placeholder="Claude Code on my laptop"
        icon="i-lucide-tag"
        class="w-full"
        maxlength="60"
        :disabled="creating"
        @keydown.enter="create"
      />
    </div>

    <div class="space-y-2">
      <p class="text-sm font-medium">
        Boards and what Claude may do on each
      </p>
      <p class="text-xs text-muted">
        Only the board you came from is picked. Tick the others you want to reach, then choose what Claude may do there.
      </p>
      <ConnectBoards
        v-model="grants"
        :boards="boards"
        :can-manage-crews="canManageCrews"
        :disabled="creating"
      />
    </div>

    <div class="space-y-2">
      <p class="text-sm font-medium">
        Lifetime
      </p>
      <USelect
        v-model="expiresInDays"
        :items="EXPIRY_OPTIONS"
        value-key="value"
        size="sm"
        class="w-44"
        :disabled="creating"
      />
    </div>

    <div class="space-y-2">
      <p class="text-sm font-medium">
        How the agent gets its key
      </p>
      <URadioGroup
        v-model="method"
        :items="CONNECT_METHODS"
        value-key="value"
        orientation="vertical"
        :disabled="creating"
        data-connect-method
      />
    </div>

    <div class="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
      <p
        class="flex-1 min-w-0 text-xs text-muted"
        data-connect-summary
      >
        {{ summary }}
      </p>
      <UButton
        label="Make the connection"
        icon="i-lucide-plug-zap"
        color="primary"
        class="sm:ml-auto justify-center"
        :disabled="!canCreate"
        :loading="creating"
        @click="create"
      />
    </div>
  </div>
</template>
