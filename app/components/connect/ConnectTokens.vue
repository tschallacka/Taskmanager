<script setup lang="ts">
import { format } from 'date-fns'
import { CONNECT_PERMISSIONS, permissionName } from '~/utils/connectPrompt'
import type { ConnectBoardChoice, ConnectMethod, ConnectTokenRow, IssuedConnection } from '~/utils/connectPrompt'

const props = defineProps<{
  tokens: ConnectTokenRow[]
  boards: ConnectBoardChoice[]
  canManageCrews: boolean
  /** The board the window was opened from, for "add this board" to the tokens that lack it. */
  currentBoardId: string | null
}>()

const emit = defineEmits<{
  changed: []
  issued: [connection: IssuedConnection]
}>()

const toast = useToast()

function errMsg(e: unknown): string | undefined {
  return (e as { data?: { message?: string } })?.data?.message
}

function dateTime(value: number): string {
  return format(new Date(value), 'PPp')
}

function expiryLabel(token: ConnectTokenRow): string {
  if (!token.expiresAt) return 'never expires'
  return token.expired ? 'expired' : `expires ${dateTime(token.expiresAt)}`
}

function pairedLine(token: ConnectTokenRow): string {
  if (!token.pairedBy) return 'Not paired with an agent yet'
  return `Paired by ${token.pairedBy.usedFrom ?? 'an agent'} at ${dateTime(token.pairedBy.usedAt)}`
}

function boardsOn(token: ConnectTokenRow): string[] {
  return token.boards.map(board => board.id)
}

function workspaceBoardsLeft(token: ConnectTokenRow): ConnectBoardChoice[] {
  const on = new Set(boardsOn(token))
  return props.boards.filter(board => !on.has(board.id))
}

// ─── Edit: the name and the boards with what they may do ───

const editing = ref<{ tokenId: string, name: string, grants: Record<string, string[]>, saving: boolean } | null>(null)

function startEdit(token: ConnectTokenRow) {
  editing.value = {
    tokenId: token.id,
    name: token.name,
    grants: Object.fromEntries(token.boards.map(board => [board.id, [...board.scopes]])),
    saving: false
  }
  adding.value = null
}

async function saveEdit(token: ConnectTokenRow) {
  const state = editing.value
  if (!state) return
  state.saving = true
  try {
    await $fetch(`/api/settings/connect-tokens/${token.id}`, {
      method: 'PUT',
      body: {
        name: state.name,
        boards: Object.entries(state.grants).map(([projectId, scopes]) => ({ projectId, scopes }))
      }
    })
    toast.add({ title: 'Connection saved', description: 'The key stays the same. The change applies to its next call.', icon: 'i-lucide-check', duration: 3000 })
    editing.value = null
    emit('changed')
  } catch (e) {
    toast.add({ title: 'Could not save the connection', description: errMsg(e), icon: 'i-lucide-alert-triangle', color: 'error' })
    if (editing.value) editing.value.saving = false
  }
}

function boardsNamed(boardId: string): string {
  return props.boards.find(board => board.id === boardId)?.name ?? 'A board'
}

// ─── Add a board to this older token, with its permissions copied from a board of this token or another ───

const adding = ref<{ tokenId: string, projectId: string, source: string, scopes: string[], saving: boolean } | null>(null)

function startAdd(token: ConnectTokenRow) {
  const first = workspaceBoardsLeft(token)[0]
  adding.value = {
    tokenId: token.id,
    projectId: props.currentBoardId && workspaceBoardsLeft(token).some(board => board.id === props.currentBoardId)
      ? props.currentBoardId
      : first?.id ?? '',
    source: sourcesFor(token)[0]?.value ?? 'hand',
    scopes: ['boards:read'],
    saving: false
  }
  editing.value = null
}

/** The boards whose permissions can be copied: the token's own boards, then the boards of its other tokens. */
function sourcesFor(token: ConnectTokenRow): { value: string, label: string }[] {
  const own = token.boards.map(board => ({ value: `own:${board.id}`, label: `${board.name} on this connection` }))
  const others = props.tokens
    .filter(other => other.id !== token.id && other.kind === 'access')
    .flatMap(other => other.boards.map(board => ({
      value: `other:${other.id}:${board.id}`,
      label: `${board.name} on "${other.name}"`
    })))
  return [...own, ...others, { value: 'hand', label: 'Pick the permissions by hand' }]
}

async function submitAdd(token: ConnectTokenRow) {
  const state = adding.value
  if (!state || !state.projectId) return
  state.saving = true
  let body: Record<string, unknown> = { projectId: state.projectId }
  if (state.source === 'hand') {
    body = { ...body, scopes: state.scopes }
  } else if (state.source.startsWith('own:')) {
    body = { ...body, copyFrom: { projectId: state.source.slice(4) } }
  } else {
    const [, tokenId, projectId] = state.source.split(':')
    body = { ...body, copyFrom: { tokenId, projectId } }
  }
  try {
    await $fetch(`/api/settings/connect-tokens/${token.id}/boards`, { method: 'POST', body })
    toast.add({ title: `Added ${boardsNamed(state.projectId)}`, icon: 'i-lucide-check', duration: 2500 })
    adding.value = null
    emit('changed')
  } catch (e) {
    toast.add({ title: 'Could not add the board', description: errMsg(e), icon: 'i-lucide-alert-triangle', color: 'error' })
    if (adding.value) adding.value.saving = false
  }
}

function toggleAddScope(scope: string, on: boolean) {
  if (!adding.value) return
  adding.value.scopes = on ? [...adding.value.scopes, scope] : adding.value.scopes.filter(item => item !== scope)
}

// ─── Regenerate: a new secret, shown once, or a pairing code for it ───

const regenerating = ref<{ tokenId: string, method: ConnectMethod, saving: boolean } | null>(null)
// The one-time result of the last regenerate, shown in that key's row until it is closed.
const issuedRow = ref<{ tokenId: string, connection: IssuedConnection } | null>(null)
const methodItems = [
  { label: 'Pairing code (recommended)', value: 'code' },
  { label: 'Show the token itself (fallback)', value: 'token' }
]

async function regenerate(token: ConnectTokenRow) {
  const state = regenerating.value
  if (!state) return
  state.saving = true
  try {
    const response = await $fetch<{ token: string }>(`/api/settings/api-keys/${token.id}/regenerate`, { method: 'POST' })
    const boards = token.boards.map(board => ({ name: board.name, workspace: board.workspace, scopes: board.scopes }))
    let access: IssuedConnection['access']
    if (state.method === 'token') {
      access = { kind: 'token', token: response.token }
    } else {
      const code = await $fetch<{ code: string, expiresAt: number }>('/api/settings/pairing-codes', {
        method: 'POST',
        body: { tokenId: token.id }
      })
      access = { kind: 'code', code: code.code, expiresAt: code.expiresAt }
    }
    regenerating.value = null
    // The result goes in this key's row, not the page's top banner: the banner is for a new connection only.
    issuedRow.value = { tokenId: token.id, connection: { title: 'New key', tokenName: token.name, boards, access } }
    nextTick(() => document.getElementById(`connect-row-${token.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
    emit('changed')
  } catch (e) {
    toast.add({ title: 'Could not make a new key', description: errMsg(e), icon: 'i-lucide-alert-triangle', color: 'error' })
    if (regenerating.value) regenerating.value.saving = false
  }
}

// ─── Revoke ───

const revoking = ref<string | null>(null)

async function revoke(token: ConnectTokenRow) {
  revoking.value = token.id
  try {
    await $fetch(`/api/settings/api-keys/${token.id}`, { method: 'DELETE' })
    toast.add({ title: `Revoked "${token.name}"`, description: 'Any agent using it stops working at once.', icon: 'i-lucide-trash', duration: 3000 })
    emit('changed')
  } catch (e) {
    toast.add({ title: 'Could not revoke the connection', description: errMsg(e), icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    revoking.value = null
  }
}

// Which permissions a connection may be given in the editors: crew management only for the instance admin.
const permissions = computed(() => CONNECT_PERMISSIONS.filter(permission => props.canManageCrews || permission.scope !== 'crews:manage'))
</script>

<template>
  <div>
    <p
      v-if="!tokens.length"
      class="text-sm text-muted"
      data-connect-empty
    >
      No connections yet. Make one above.
    </p>

    <ul
      v-else
      class="space-y-3"
      data-connect-tokens
    >
      <li
        v-for="token in tokens"
        :id="`connect-row-${token.id}`"
        :key="token.id"
        class="rounded-lg border border-default p-4 space-y-3 min-w-0"
        :data-token="token.id"
      >
        <div class="flex items-start gap-3 min-w-0">
          <div class="flex-1 min-w-0 space-y-1">
            <div class="flex flex-wrap items-center gap-2 min-w-0">
              <p class="text-sm font-medium break-words min-w-0">
                {{ token.name }}
              </p>
              <UBadge
                v-if="token.kind === 'management'"
                label="10-minute management token"
                color="info"
                variant="subtle"
                size="sm"
              />
              <UBadge
                v-if="token.expired"
                label="expired"
                color="error"
                variant="subtle"
                size="sm"
              />
            </div>
            <p class="text-xs text-muted break-words">
              <code class="font-mono">{{ token.keyPrefix }}…</code>
              · {{ expiryLabel(token) }}
              · {{ token.lastUsedAt ? `last used ${dateTime(token.lastUsedAt)}` : 'never used' }}
            </p>
            <p
              class="text-xs text-muted break-words"
              data-paired-by
            >
              {{ pairedLine(token) }}
            </p>
          </div>
        </div>

        <div
          v-if="token.boards.length"
          class="space-y-1.5"
        >
          <p class="text-xs font-medium">
            Boards it reaches
          </p>
          <ul class="space-y-1 text-xs text-muted">
            <li
              v-for="board in token.boards"
              :key="board.id"
              class="break-words"
              :data-board="board.id"
            >
              <span class="text-default">{{ board.name }}</span>
              · {{ board.workspace }}
              · {{ board.scopes.map(permissionName).join(', ') || 'no permissions' }}
            </li>
          </ul>
        </div>
        <p
          v-else
          class="text-xs text-error"
        >
          This connection reaches no boards now.
        </p>

        <!-- Edit the name and the boards -->
        <div
          v-if="editing && editing.tokenId === token.id"
          class="rounded-lg bg-elevated/40 p-3 space-y-3"
        >
          <UInput
            v-model="editing.name"
            class="w-full"
            maxlength="60"
            aria-label="Connection name"
            :disabled="editing.saving"
          />
          <div class="space-y-2">
            <p class="text-xs font-medium">
              Boards and what Claude may do on each
            </p>
            <ConnectBoards
              :model-value="editing.grants"
              :boards="boards"
              :can-manage-crews="canManageCrews"
              :disabled="editing.saving"
              @update:model-value="editing.grants = $event"
            />
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              label="Save"
              icon="i-lucide-save"
              color="primary"
              size="sm"
              :loading="editing.saving"
              @click="saveEdit(token)"
            />
            <UButton
              label="Cancel"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="editing = null"
            />
            <p class="text-xs text-muted w-full">
              The key stays the same. Taking a board off removes it from this connection.
            </p>
          </div>
        </div>

        <!-- Add a board to this token -->
        <div
          v-if="adding && adding.tokenId === token.id"
          class="rounded-lg bg-elevated/40 p-3 space-y-3"
          data-connect-add
        >
          <p class="text-xs font-medium">
            Add a board
          </p>
          <USelect
            v-model="adding.projectId"
            :items="workspaceBoardsLeft(token).map(board => ({ label: `${board.name} · ${board.workspace}`, value: board.id }))"
            value-key="value"
            size="sm"
            class="w-full"
            :disabled="adding.saving"
            aria-label="Board to add"
          />
          <p class="text-xs font-medium">
            Its permissions
          </p>
          <USelect
            v-model="adding.source"
            :items="sourcesFor(token).map(source => ({ label: source.label, value: source.value }))"
            value-key="value"
            size="sm"
            class="w-full"
            :disabled="adding.saving"
            aria-label="Copy permissions from"
          />
          <div
            v-if="adding.source === 'hand'"
            class="flex flex-col gap-2"
          >
            <UCheckbox
              v-for="permission in permissions"
              :key="permission.scope"
              :model-value="adding.scopes.includes(permission.scope)"
              :label="permission.label"
              :disabled="adding.saving"
              @update:model-value="toggleAddScope(permission.scope, $event === true)"
            />
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              label="Add this board"
              icon="i-lucide-plus"
              color="primary"
              size="sm"
              :disabled="!adding.projectId || (adding.source === 'hand' && !adding.scopes.length)"
              :loading="adding.saving"
              @click="submitAdd(token)"
            />
            <UButton
              label="Cancel"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="adding = null"
            />
          </div>
        </div>

        <!-- Regenerate: choose how the new key is handed over -->
        <div
          v-if="regenerating && regenerating.tokenId === token.id"
          class="rounded-lg bg-elevated/40 p-3 space-y-3"
        >
          <p class="text-xs text-muted">
            The old key stops working at once. Pick how the new one reaches your agent.
          </p>
          <URadioGroup
            v-model="regenerating.method"
            :items="methodItems"
            value-key="value"
            orientation="vertical"
          />
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              label="Make a new key"
              icon="i-lucide-refresh-cw"
              color="warning"
              size="sm"
              :loading="regenerating.saving"
              @click="regenerate(token)"
            />
            <UButton
              label="Cancel"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="regenerating = null"
            />
          </div>
        </div>

        <!-- Actions -->
        <div
          v-if="!(editing && editing.tokenId === token.id) && !(adding && adding.tokenId === token.id) && !(regenerating && regenerating.tokenId === token.id)"
          class="flex flex-wrap items-center gap-2"
        >
          <UButton
            v-if="token.kind === 'access'"
            label="Edit boards"
            icon="i-lucide-pencil"
            color="neutral"
            variant="soft"
            size="xs"
            @click="startEdit(token)"
          />
          <UButton
            v-if="token.kind === 'access' && workspaceBoardsLeft(token).length"
            label="Add a board"
            icon="i-lucide-plus"
            color="neutral"
            variant="soft"
            size="xs"
            @click="startAdd(token)"
          />
          <UButton
            v-if="token.kind === 'access'"
            label="Regenerate key"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="regenerating = { tokenId: token.id, method: 'code', saving: false }"
          />
          <UButton
            label="Revoke"
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="xs"
            class="ml-auto"
            :loading="revoking === token.id"
            @click="revoke(token)"
          />
        </div>
        <!-- A regenerated key's result sits in its own row, under the buttons that made it, so the owner sees it where they clicked. -->
        <ConnectResult
          v-if="issuedRow && issuedRow.tokenId === token.id"
          :issued="issuedRow.connection"
          data-connect-row-result
          @dismiss="issuedRow = null"
        />
      </li>
    </ul>
  </div>
</template>
