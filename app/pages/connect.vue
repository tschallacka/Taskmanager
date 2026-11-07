<script setup lang="ts">
import type { ConnectBoardChoice, ConnectTokenRow, IssuedConnection } from '~/utils/connectPrompt'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Connect your Claude to this board' })

interface ConnectWindowResponse {
  tokens: ConnectTokenRow[]
  boards: ConnectBoardChoice[]
  canManageCrews: boolean
}

const route = useRoute()

// The board the window was opened from. Only this one is picked when a new connection is made.
const currentBoardId = computed(() => (typeof route.query.board === 'string' ? route.query.board : null))

const { data, status, refresh } = useFetch<ConnectWindowResponse>('/api/settings/connect-tokens', { server: false, lazy: true })
const tokens = computed(() => data.value?.tokens ?? [])
const boards = computed(() => data.value?.boards ?? [])
const canManageCrews = computed(() => data.value?.canManageCrews ?? false)
const currentBoard = computed(() => boards.value.find(board => board.id === currentBoardId.value) ?? null)

// The panel with the one-time key or code. It stays until the owner dismisses it, and a new one replaces it.
const issued = ref<IssuedConnection | null>(null)

function onIssued(connection: IssuedConnection) {
  issued.value = connection
}
</script>

<template>
  <div class="flex-1 min-w-0 flex flex-col overflow-hidden pb-14 lg:pb-0">
    <div class="sticky top-0 z-10 border-b border-default bg-default/95 backdrop-blur-sm shrink-0">
      <div class="px-4 pt-3 pb-3.5 flex items-center gap-3 min-w-0">
        <UButton
          to="/settings"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Back to settings"
        />
        <h1 class="font-semibold text-sm min-w-0 truncate">
          Connect your Claude to this board
        </h1>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto">
      <UContainer class="py-6 space-y-4 px-4">
        <div class="rounded-xl border border-default bg-default px-5 py-4 space-y-2">
          <p class="text-sm font-medium">
            Let your Claude work on your boards
          </p>
          <p class="text-sm text-muted">
            Make a connection for each agent. It picks the boards it may reach and what it may do on each one. Your Claude then
            gets a prompt to paste, and a one-time code (or the key itself) to start with. You can change or revoke any connection here.
          </p>
          <p
            v-if="currentBoard"
            class="text-xs text-muted"
          >
            You came from <span class="font-medium text-default">{{ currentBoard.name }}</span>. Only that board is picked for a new connection.
          </p>
        </div>

        <ConnectResult
          v-if="issued"
          :issued="issued"
          @dismiss="issued = null"
        />

        <section class="rounded-xl border border-default bg-default overflow-hidden">
          <div class="px-5 py-3 border-b border-default bg-elevated/40 flex items-center gap-2">
            <UIcon
              name="i-lucide-plus"
              class="size-4 text-primary"
            />
            <span class="text-xs font-semibold text-muted uppercase tracking-wider">New connection</span>
          </div>
          <div class="px-5 py-4">
            <ConnectNewToken
              :boards="boards"
              :can-manage-crews="canManageCrews"
              :current-board-id="currentBoardId"
              @issued="onIssued"
              @created="refresh()"
            />
          </div>
        </section>

        <section class="rounded-xl border border-default bg-default overflow-hidden">
          <div class="px-5 py-3 border-b border-default bg-elevated/40 flex items-center gap-2">
            <UIcon
              name="i-lucide-list"
              class="size-4 text-primary"
            />
            <span class="text-xs font-semibold text-muted uppercase tracking-wider">Your connections</span>
          </div>
          <div class="px-5 py-4">
            <p
              v-if="status === 'pending' && !data"
              class="text-sm text-muted"
            >
              Loading connections…
            </p>
            <ConnectTokens
              v-else
              :tokens="tokens"
              :boards="boards"
              :can-manage-crews="canManageCrews"
              :current-board-id="currentBoardId"
              @changed="refresh()"
              @issued="onIssued"
            />
          </div>
        </section>
      </UContainer>
    </div>
  </div>
</template>
