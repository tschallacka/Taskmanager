<script setup lang="ts">
import { format } from 'date-fns'
import { keyPanelMode } from '~/utils/apiKeyView'
import type { Ref } from 'vue'

interface ReachWorkspace {
  teamId: string | null
  name: string | null
}

interface ReachBoard {
  id: string
  name: string
  teamId: string | null
}

/** A board a key reaches, by name and workspace; read-only when a crew reads it through its link. */
interface ReachedBoardRow {
  id: string
  name: string
  teamId: string | null
  workspace: string
  readOnly: boolean
}

interface ApiKeySummary {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  createdAt: number
  lastUsedAt: number | null
  expiresAt: number | null
  teamId: string | null
  teamName: string | null
  /** Only the owner changes a personal key here; a team key is changed on the team page. */
  editable: boolean
  allBoards: boolean
  workspaces: ReachWorkspace[]
  boards: ReachBoard[]
  reachedBoards: ReachedBoardRow[]
}

interface ApiKeysResponse {
  workspaces: { id: string | null, name: string }[]
  boards: (ReachBoard & { workspace: string })[]
  keys: ApiKeySummary[]
}

interface ReachPick {
  all: boolean
  workspaces: string[]
  boards: string[]
}

const toast = useToast()
const { switchWorkspace } = useWorkspace()

const { data, status, refresh } = useFetch<ApiKeysResponse>('/api/settings/api-keys', { server: false, lazy: true })

const keys = computed(() => data.value?.keys ?? [])
const workspaces = computed(() => data.value?.workspaces ?? [])
const pickBoards = computed(() => data.value?.boards ?? [])

const wsKeyOf = (teamId: string | null) => teamId ?? 'personal'

const EXPIRY_OPTIONS = [
  { label: 'Never expires', value: 0 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '1 year', value: 365 }
]

// One toggle per permission, in the order they are advertised to a client.
const PERMISSIONS = [
  { scope: 'boards:read', label: 'Read boards', description: 'Boards, tasks and updates' },
  { scope: 'boards:write', label: 'Write boards', description: 'Create, edit, move and delete' },
  { scope: 'secrets:read', label: 'Read project secrets', description: 'Names of a project\'s secrets and its .env text, values included. Every read is recorded in the project\'s trail' },
  { scope: 'secrets:write', label: 'Write project secrets', description: 'Add, change and delete a project\'s secrets by name, where this person is a project manager' }
] as const

const emptyPick = (): ReachPick => ({ all: false, workspaces: [], boards: [] })
const pickIsSet = (pick: ReachPick) => pick.all || pick.workspaces.length > 0 || pick.boards.length > 0

// What the server stores: a null workspace is the personal one.
function reachBody(pick: ReachPick) {
  return {
    allBoards: pick.all,
    workspaceTeamIds: pick.workspaces.map(key => (key === 'personal' ? null : key)),
    boardIds: pick.boards
  }
}

const newName = ref('')
const granted = ref<Record<string, boolean>>(
  Object.fromEntries(PERMISSIONS.map(permission => [permission.scope, permission.scope.startsWith('boards:')]))
)
const newPick = ref<ReachPick>(emptyPick())
const expiresInDays = ref(0)
const creating = ref(false)

// The key itself only exists in this response — once it is dismissed it is gone.
const issuedToken = ref<string | null>(null)
const copied = ref(false)
const commandCopied = ref(false)
const scopes = computed(() => PERMISSIONS.filter(p => granted.value[p.scope]).map(p => p.scope))

const canCreate = computed(() => newName.value.trim().length > 0 && scopes.value.length > 0 && pickIsSet(newPick.value))

function errMsg(e: unknown): string | undefined {
  return (e as { data?: { message?: string } })?.data?.message
}

async function createKey() {
  if (!canCreate.value) return
  creating.value = true
  try {
    const response = await $fetch<{ token: string }>('/api/settings/api-keys', {
      method: 'POST',
      body: {
        name: newName.value.trim(),
        scopes: scopes.value,
        expiresInDays: expiresInDays.value === 0 ? null : expiresInDays.value,
        reach: reachBody(newPick.value)
      }
    })
    issuedToken.value = response.token
    copied.value = false
    commandCopied.value = false
    newName.value = ''
    await refresh()
  } catch (e) {
    toast.add({ title: 'Could not create the key', description: errMsg(e), icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    creating.value = false
  }
}

async function copyToken() {
  if (!issuedToken.value) return
  try {
    await navigator.clipboard.writeText(issuedToken.value)
    copied.value = true
    toast.add({ title: 'Key copied', icon: 'i-lucide-check', duration: 2000 })
  } catch {
    toast.add({ title: 'Could not copy — select the key and copy it manually', icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

// The key goes into the shell's environment and `claude mcp add` reads it from there, so the
// setup instructions copied later find it as $TASKMANAGER_API_KEY too.
const claudeCommand = computed(() => {
  if (!issuedToken.value) return ''
  return `${PROFILE_STEP}\n${exportKeyCommand(issuedToken.value)}\n${mcpAddCommand(window.location.origin)}`
})

// Already connected: one paste swaps the key in and the server out for a fresh one.
const replaceCommand = computed(() => (issuedToken.value ? mcpReplaceCommand(window.location.origin, issuedToken.value) : ''))

const origin = import.meta.client ? window.location.origin : ''
const kitCommands = crewKitCommands(origin)
const instructions = agentInstructions(origin)
const kitCopied = ref<string | null>(null)

async function copyKit(text: string, id: string) {
  try {
    await navigator.clipboard.writeText(text)
    kitCopied.value = id
    setTimeout(() => {
      if (kitCopied.value === id) kitCopied.value = null
    }, 2000)
  } catch {
    toast.add({ title: 'Could not copy — select the text and copy it manually', icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

const replaceCopied = ref(false)

async function copyWithFeedback(text: string, copiedFlag: Ref<boolean>, title: string) {
  try {
    await navigator.clipboard.writeText(text)
    copiedFlag.value = true
    toast.add({ title, icon: 'i-lucide-check', duration: 2000 })
  } catch {
    toast.add({ title: 'Could not copy — select the command and copy it manually', icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

// ─── Active keys: one row each, opened to see and change what it reaches ───

const openId = ref<string | null>(null)
const editing = ref<{ scopes: Record<string, boolean>, pick: ReachPick, saving: boolean } | null>(null)

function toggleKey(key: ApiKeySummary) {
  if (openId.value === key.id) {
    openId.value = null
    editing.value = null
    return
  }
  // A row opens to its read-only view. The edit form opens only when the owner asks for it (startEdit).
  openId.value = key.id
  editing.value = null
}

function startEdit(key: ApiKeySummary) {
  if (!key.editable) return
  editing.value = {
    scopes: Object.fromEntries(PERMISSIONS.map(permission => [permission.scope, key.scopes.includes(permission.scope)])),
    pick: {
      all: key.allBoards,
      workspaces: key.workspaces.map(workspace => wsKeyOf(workspace.teamId)),
      boards: key.boards.map(board => board.id)
    },
    saving: false
  }
}

async function copyCommand() {
  if (!issuedToken.value) return
  await copyWithFeedback(claudeCommand.value, commandCopied, 'Command copied')
}

async function copyReplaceCommand() {
  if (!issuedToken.value) return
  await copyWithFeedback(replaceCommand.value, replaceCopied, 'Update command copied')
}

// Delete and regenerate ask first, inline. The confirmation names the key and its secret prefix and last use, so two
// keys with the same name can be told apart.
const confirming = ref<{ id: string, action: 'delete' | 'regenerate' } | null>(null)
const deleting = ref<string | null>(null)
const regenerating = ref<string | null>(null)
// The setup prompt of one key. Its token is set only right after a regenerate: that secret is shown once, never again.
const shownPrompt = ref<{ id: string, token: string | null } | null>(null)
const promptCopied = ref(false)

// The ready-to-paste setup: the key in the shell, then the server added to Claude Code. Without a secret the key is a placeholder.
function setupCommandFor(token: string | null): string {
  return `${PROFILE_STEP}\n${exportKeyCommand(token ?? '<paste the new key>')}\n${mcpAddCommand(window.location.origin)}`
}

function showPrompt(key: ApiKeySummary) {
  shownPrompt.value = shownPrompt.value?.id === key.id ? null : { id: key.id, token: null }
  promptCopied.value = false
}

async function copyPrompt() {
  if (!shownPrompt.value) return
  await copyWithFeedback(setupCommandFor(shownPrompt.value.token), promptCopied, 'Setup prompt copied')
}

async function deleteKey(key: ApiKeySummary) {
  deleting.value = key.id
  try {
    await $fetch(`/api/settings/api-keys/${key.id}`, { method: 'DELETE' })
    toast.add({ title: `Deleted "${key.name}"`, description: 'The key stops working at once.', icon: 'i-lucide-trash', duration: 2000 })
    confirming.value = null
    openId.value = null
    editing.value = null
    if (shownPrompt.value?.id === key.id) shownPrompt.value = null
    await refresh()
  } catch (e) {
    toast.add({ title: 'Could not delete the key', description: errMsg(e), icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    deleting.value = null
  }
}

async function regenerateSecret(key: ApiKeySummary) {
  regenerating.value = key.id
  try {
    const response = await $fetch<{ token: string }>(`/api/settings/api-keys/${key.id}/regenerate`, { method: 'POST' })
    shownPrompt.value = { id: key.id, token: response.token }
    promptCopied.value = false
    confirming.value = null
    toast.add({ title: `Regenerated "${key.name}"`, description: 'The old secret stopped working at once. Copy the new one now: it is shown once.', icon: 'i-lucide-refresh-cw', duration: 4000 })
    await refresh()
  } catch (e) {
    toast.add({ title: 'Could not regenerate the key', description: errMsg(e), icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    regenerating.value = null
  }
}

function keyUseLabel(key: ApiKeySummary): string {
  return key.lastUsedAt ? `last used ${formatDate(key.lastUsedAt)}` : 'never used'
}

async function saveKey(key: ApiKeySummary) {
  const state = editing.value
  if (!state) return
  const scopeList = PERMISSIONS.filter(p => state.scopes[p.scope]).map(p => p.scope)
  if (!scopeList.length) {
    toast.add({ title: 'Pick at least one permission', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  if (!pickIsSet(state.pick)) {
    toast.add({ title: 'Pick at least one board or workspace, or Select all', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  state.saving = true
  try {
    await $fetch(`/api/settings/api-keys/${key.id}`, {
      method: 'PATCH',
      body: { name: key.name, scopes: scopeList, reach: reachBody(state.pick) }
    })
    toast.add({ title: 'Key saved', description: 'Changing permissions keeps the secret. The change applies to the key\'s next call.', icon: 'i-lucide-check', duration: 3000 })
    openId.value = null
    editing.value = null
    await refresh()
  } catch (e) {
    toast.add({ title: 'Could not save the key', description: errMsg(e), icon: 'i-lucide-alert-triangle', color: 'error' })
    if (editing.value) editing.value.saving = false
  }
}

// A team key is changed on the team page, so the link switches to that team first.
async function openTeamKeys(key: ApiKeySummary) {
  if (!key.teamId) return
  await switchWorkspace(key.teamId)
  await navigateTo({ path: '/team', query: { section: 'keys' } })
}

// Badges read "boards: write", short enough to sit beside a key name.
function scopeLabel(scope: string): string {
  // Shown on a key only the instance admin can hold; the picker never offers it.
  if (scope === 'crews:manage') return 'crew api'
  const [feature, permission] = scope.split(':')
  return `${feature} ${permission}`
}

function scopeColor(scope: string) {
  return scope.endsWith(':write') ? 'warning' as const : 'neutral' as const
}

function permissionLabel(scope: string): string {
  return PERMISSIONS.find(permission => permission.scope === scope)?.label ?? scopeLabel(scope)
}

function formatDate(value: number): string {
  return format(new Date(value), 'PP')
}

function expiryLabel(key: ApiKeySummary): string {
  if (!key.expiresAt) return 'never expires'
  return key.expiresAt <= Date.now() ? 'expired' : `expires ${formatDate(key.expiresAt)}`
}

function reachLabel(key: ApiKeySummary): string {
  if (key.allBoards) return 'all your boards'
  const parts = []
  if (key.workspaces.length) parts.push(`${key.workspaces.length} workspace${key.workspaces.length === 1 ? '' : 's'}`)
  if (key.boards.length) parts.push(`${key.boards.length} board${key.boards.length === 1 ? '' : 's'}`)
  return parts.join(' and ') || 'no boards'
}
</script>

<template>
  <div class="rounded-xl border border-default bg-default overflow-hidden">
    <div class="px-5 py-3 border-b border-default bg-elevated/40 flex flex-wrap items-center gap-2">
      <UIcon
        name="i-lucide-plug-zap"
        class="size-4 text-primary"
      />
      <span class="text-xs font-semibold text-muted uppercase tracking-wider">API keys &amp; MCP</span>
      <UButton
        to="/mcp"
        label="Setup guide"
        icon="i-lucide-book-open"
        color="neutral"
        variant="ghost"
        size="xs"
        class="ml-auto"
      />
      <UButton
        to="/api/settings/skill"
        external
        download="SKILL.md"
        label="Agent skill"
        icon="i-lucide-download"
        color="neutral"
        variant="ghost"
        size="xs"
        data-skill-download
      />
      <UPopover :content="{ align: 'end' }">
        <UButton
          label="Crew kit"
          icon="i-lucide-boxes"
          color="neutral"
          variant="ghost"
          size="xs"
        />
        <template #content>
          <div class="w-[min(36rem,calc(100vw-2rem))] p-4 space-y-3">
            <div class="flex items-center gap-2">
              <p class="text-sm font-medium">
                Install the crew kit and its skill
              </p>
              <UButton
                :icon="kitCopied === 'kit' ? 'i-lucide-check' : 'i-lucide-copy'"
                :label="kitCopied === 'kit' ? 'Copied' : 'Copy'"
                color="primary"
                variant="soft"
                size="xs"
                class="ml-auto"
                @click="copyKit(kitCommands, 'kit')"
              />
            </div>
            <pre class="text-xs font-mono bg-elevated/50 border border-default rounded-md p-3 whitespace-pre-wrap break-all">{{ kitCommands }}</pre>
            <p class="text-xs text-muted">
              Run it on the agent's machine (Node 20 or newer); run it again to update the kit. Then follow
              <code class="font-mono">~/crew-kit/README.md</code>.
            </p>
            <div class="flex flex-wrap items-center gap-2 pt-1">
              <UButton
                :icon="kitCopied === 'all' ? 'i-lucide-check' : 'i-lucide-clipboard-list'"
                :label="kitCopied === 'all' ? 'Copied' : 'Copy everything for Claude Code'"
                color="neutral"
                variant="subtle"
                size="xs"
                @click="copyKit(instructions, 'all')"
              />
              <UButton
                to="/settings/sprocket"
                label="Crew channel and more"
                trailing-icon="i-lucide-arrow-right"
                color="neutral"
                variant="ghost"
                size="xs"
              />
            </div>
          </div>
        </template>
      </UPopover>
    </div>

    <div class="divide-y divide-default">
      <!-- Intro -->
      <div class="px-5 py-4 flex items-start gap-4">
        <div class="size-8 rounded-lg bg-elevated flex items-center justify-center shrink-0">
          <UIcon
            name="i-lucide-bot"
            class="size-4 text-default"
          />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium">
            Connect an AI agent
          </p>
          <p class="text-xs text-muted mt-0.5">
            An API key lets Claude Code, Claude Desktop or any other MCP client read and write the boards you pick, from any workspace you are in.
          </p>
        </div>
      </div>

      <!-- One-time key reveal -->
      <div
        v-if="issuedToken"
        class="px-5 py-4 bg-primary/5"
      >
        <div class="flex items-start gap-4">
          <div class="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <UIcon
              name="i-lucide-key-round"
              class="size-4 text-primary"
            />
          </div>
          <div class="flex-1 min-w-0 space-y-2">
            <p class="text-sm font-medium">
              Copy your key now
            </p>
            <p class="text-xs text-muted">
              This is the only time it is shown. Taskmanager stores a hash of it, so it cannot be displayed again.
            </p>
            <div class="flex gap-2">
              <code class="flex-1 min-w-0 text-xs font-mono bg-default border border-default rounded-md px-3 py-2 overflow-x-auto whitespace-nowrap">{{ issuedToken }}</code>
              <UButton
                :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
                :label="copied ? 'Copied' : 'Copy'"
                color="primary"
                size="sm"
                @click="copyToken"
              />
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="Dismiss key"
                @click="issuedToken = null"
              />
            </div>
            <p class="text-xs text-muted pt-1">
              Or connect Claude Code in one go. These lines put the key in
              <code class="font-mono">$TASKMANAGER_API_KEY</code> and add the MCP server by that name only, so
              the key is not saved in Claude Code settings; only the variable name is. Claude Code reads the variable every time it starts.
              {{ KEY_VARIABLE_HOME }}
              Then open a new terminal, check with <code class="font-mono">echo ${TASKMANAGER_API_KEY:0:4}</code>
              that it prints <code class="font-mono">arn_</code>, then start <code class="font-mono">claude</code>.
            </p>
            <div class="flex flex-col sm:flex-row gap-2">
              <pre class="flex-1 min-w-0 text-xs font-mono bg-default border border-default rounded-md px-3 py-2 whitespace-pre-wrap break-words">{{ claudeCommand }}</pre>
              <UButton
                :icon="commandCopied ? 'i-lucide-check' : 'i-lucide-copy'"
                :label="commandCopied ? 'Copied' : 'Copy command'"
                color="neutral"
                variant="soft"
                size="sm"
                @click="copyCommand"
              />
            </div>
            <p class="text-xs text-muted pt-1">
              {{ ALREADY_CONNECTED_STEP }} Paste the update command below.
              {{ RESTART_STEP }}
            </p>
            <div class="flex flex-col sm:flex-row gap-2">
              <pre class="flex-1 min-w-0 text-xs font-mono bg-default border border-default rounded-md px-3 py-2 whitespace-pre-wrap break-words">{{ replaceCommand }}</pre>
              <UButton
                :icon="replaceCopied ? 'i-lucide-check' : 'i-lucide-copy'"
                :label="replaceCopied ? 'Copied' : 'Copy update command'"
                color="neutral"
                variant="soft"
                size="sm"
                @click="copyReplaceCommand"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Create -->
      <div class="px-5 py-4 space-y-3">
        <div class="flex items-center gap-4">
          <div class="size-8 rounded-lg bg-elevated flex items-center justify-center shrink-0">
            <UIcon
              name="i-lucide-plus"
              class="size-4 text-default"
            />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium">
              New key
            </p>
            <p class="text-xs text-muted mt-0.5">
              Give it a name you will recognise, and only the permissions it needs
            </p>
          </div>
        </div>

        <div class="pl-12 space-y-3">
          <UInput
            v-model="newName"
            placeholder="Claude Code on my laptop"
            icon="i-lucide-tag"
            class="w-full"
            :disabled="creating"
            @keydown.enter="createKey"
          />

          <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
            <UCheckbox
              v-for="permission in PERMISSIONS"
              :key="permission.scope"
              v-model="granted[permission.scope]"
              :label="permission.label"
              :description="permission.description"
            />
            <USelect
              v-model="expiresInDays"
              :items="EXPIRY_OPTIONS"
              value-key="value"
              size="sm"
              class="w-40"
            />
            <UButton
              label="Create key"
              icon="i-lucide-key-round"
              size="sm"
              color="primary"
              class="ml-auto"
              :disabled="!canCreate"
              :loading="creating"
              @click="createKey"
            />
          </div>

          <div class="space-y-2">
            <p class="text-xs font-medium">
              Boards this key reaches
            </p>
            <ApiKeyReachPicker
              v-model="newPick"
              :boards="pickBoards"
              :workspaces="workspaces"
              :disabled="creating"
            />
            <p
              v-if="!pickIsSet(newPick)"
              class="text-xs text-error"
            >
              Pick at least one board or workspace, or Select all.
            </p>
          </div>

          <p
            v-if="!scopes.length"
            class="text-xs text-error"
          >
            Pick at least one permission.
          </p>

          <p
            data-key-hint
            class="min-h-8 text-xs text-muted"
          >
            {{ newName.trim() ? 'Create key adds it to Active keys below.' : 'Name the key first, for example "Claude Code on my laptop", then the button turns on.' }}
          </p>
        </div>
      </div>

      <!-- Existing keys -->
      <div class="px-5 py-4 space-y-3">
        <div class="flex items-center gap-4">
          <div class="size-8 rounded-lg bg-elevated flex items-center justify-center shrink-0">
            <UIcon
              name="i-lucide-list"
              class="size-4 text-default"
            />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium">
              Active keys
            </p>
            <p class="text-xs text-muted mt-0.5">
              Open a key to see what it reaches, to change its permissions and boards, to regenerate its secret, or to delete it.
            </p>
          </div>
        </div>

        <div class="pl-12">
          <p
            v-if="status === 'pending'"
            class="text-xs text-muted"
          >
            Loading keys…
          </p>
          <p
            v-else-if="!keys.length"
            class="text-xs text-muted"
          >
            No keys yet. Create one above, then follow the
            <NuxtLink
              to="/mcp"
              class="text-primary underline"
            >setup guide</NuxtLink>.
          </p>

          <div
            v-else
            class="divide-y divide-default border border-default rounded-lg"
          >
            <div
              v-for="key in keys"
              :key="key.id"
            >
              <button
                type="button"
                class="w-full px-3 py-2.5 flex items-center gap-3 text-left"
                :aria-expanded="openId === key.id"
                @click="toggleKey(key)"
              >
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <p class="text-sm font-medium truncate">
                      {{ key.name }}
                    </p>
                    <UBadge
                      v-if="!key.editable"
                      :label="`Team key · ${key.teamName ?? 'a team'}`"
                      color="info"
                      variant="subtle"
                      size="sm"
                    />
                    <UBadge
                      v-for="scope in key.scopes"
                      :key="scope"
                      :label="scopeLabel(scope)"
                      :color="scopeColor(scope)"
                      variant="subtle"
                      size="sm"
                    />
                  </div>
                  <p class="text-xs text-muted mt-0.5 truncate">
                    <code class="font-mono">{{ key.keyPrefix }}…</code>
                    · reaches {{ reachLabel(key) }}
                    · {{ key.lastUsedAt ? `last used ${formatDate(key.lastUsedAt)}` : 'never used' }}
                    · {{ expiryLabel(key) }}
                  </p>
                </div>
                <UIcon
                  :name="openId === key.id ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                  class="size-4 text-muted shrink-0"
                />
              </button>

              <div
                v-if="openId === key.id"
                class="px-3 pb-3 space-y-4"
              >
                <!-- Actions on a personal key. They sit outside the edit form, so they show without opening it -->
                <div
                  v-if="key.editable"
                  class="space-y-3"
                >
                  <div class="flex flex-wrap items-center gap-2">
                    <UButton
                      label="Regenerate key"
                      icon="i-lucide-refresh-cw"
                      color="neutral"
                      variant="soft"
                      size="xs"
                      data-key-regenerate
                      :loading="regenerating === key.id"
                      @click="confirming = { id: key.id, action: 'regenerate' }"
                    />
                    <UButton
                      label="Show prompt"
                      icon="i-lucide-terminal"
                      color="neutral"
                      variant="soft"
                      size="xs"
                      data-key-prompt
                      @click="showPrompt(key)"
                    />
                    <UButton
                      label="Delete key"
                      icon="i-lucide-trash-2"
                      color="error"
                      variant="ghost"
                      size="xs"
                      class="ml-auto"
                      data-key-delete
                      :loading="deleting === key.id"
                      @click="confirming = { id: key.id, action: 'delete' }"
                    />
                  </div>

                  <div
                    v-if="confirming?.id === key.id"
                    class="rounded-lg border border-default p-3 space-y-2"
                  >
                    <p class="text-sm">
                      {{ confirming.action === 'delete' ? 'Delete' : 'Regenerate the secret of' }} "{{ key.name }}"
                      (<code class="font-mono text-xs">{{ key.keyPrefix }}…</code>, {{ keyUseLabel(key) }})?
                    </p>
                    <p class="text-xs text-muted">
                      {{ confirming.action === 'delete'
                        ? 'The key stops working at once. Any agent that holds it is refused as revoked.'
                        : 'The old secret stops working at once. Permissions and boards stay. The new secret is shown once.' }}
                    </p>
                    <div class="flex flex-wrap items-center gap-2">
                      <UButton
                        :label="confirming.action === 'delete' ? 'Delete key' : 'Regenerate'"
                        :color="confirming.action === 'delete' ? 'error' : 'primary'"
                        size="sm"
                        :loading="confirming.action === 'delete' ? deleting === key.id : regenerating === key.id"
                        @click="confirming.action === 'delete' ? deleteKey(key) : regenerateSecret(key)"
                      />
                      <UButton
                        label="Keep it"
                        color="neutral"
                        variant="ghost"
                        size="sm"
                        @click="confirming = null"
                      />
                    </div>
                  </div>

                  <div
                    v-if="shownPrompt?.id === key.id"
                    class="space-y-2"
                  >
                    <div v-if="shownPrompt.token">
                      <p class="text-xs font-medium">
                        The new secret. It is shown once: copy it now.
                      </p>
                      <code class="block text-xs font-mono bg-default border border-default rounded-md px-3 py-2 overflow-x-auto whitespace-nowrap">{{ shownPrompt.token }}</code>
                    </div>
                    <p
                      v-else
                      class="text-xs text-muted"
                    >
                      Regenerate the key to get a secret to paste. Until then the prompt shows a placeholder.
                    </p>
                    <pre class="text-xs font-mono bg-elevated/50 border border-default rounded-md p-3 whitespace-pre-wrap break-all">{{ setupCommandFor(shownPrompt.token) }}</pre>
                    <UButton
                      :label="promptCopied ? 'Copied' : 'Copy setup prompt'"
                      :icon="promptCopied ? 'i-lucide-check' : 'i-lucide-copy'"
                      color="neutral"
                      variant="soft"
                      size="xs"
                      @click="copyPrompt"
                    />
                  </div>
                </div>

                <!-- Editing a personal key -->
                <template v-if="keyPanelMode(key, editing) === 'edit' && editing">
                  <div class="space-y-2">
                    <p class="text-xs font-medium">
                      Permissions
                    </p>
                    <div class="flex flex-wrap gap-x-5 gap-y-2">
                      <UCheckbox
                        v-for="permission in PERMISSIONS"
                        :key="permission.scope"
                        v-model="editing.scopes[permission.scope]"
                        :label="permission.label"
                        :description="permission.description"
                        :disabled="editing.saving"
                      />
                    </div>
                  </div>

                  <div class="space-y-2">
                    <p class="text-xs font-medium">
                      Boards it reaches
                    </p>
                    <ApiKeyReachPicker
                      v-model="editing.pick"
                      :boards="pickBoards"
                      :workspaces="workspaces"
                      :disabled="editing.saving"
                    />
                  </div>

                  <div class="flex flex-wrap items-center gap-2">
                    <UButton
                      label="Save"
                      icon="i-lucide-save"
                      color="primary"
                      size="sm"
                      :loading="editing.saving"
                      @click="saveKey(key)"
                    />
                    <UButton
                      label="Cancel"
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      @click="toggleKey(key)"
                    />
                  </div>
                  <p class="text-xs text-muted">
                    Changing permissions keeps the secret, so no agent needs reconnecting. The change applies to the key's next call.
                  </p>
                </template>

                <!-- Read only: a team key, or a personal key's reach as it stands -->
                <template v-else>
                  <div
                    v-if="key.editable"
                    class="flex flex-wrap items-center gap-2"
                  >
                    <UButton
                      label="Change permissions and boards"
                      icon="i-lucide-pencil"
                      color="neutral"
                      variant="soft"
                      size="xs"
                      data-key-edit
                      @click="startEdit(key)"
                    />
                  </div>
                  <div class="space-y-2 text-xs">
                    <p class="font-medium text-default">
                      Permissions
                    </p>
                    <p class="text-muted">
                      {{ key.scopes.map(permissionLabel).join(' · ') || 'None' }}
                    </p>
                    <p class="font-medium text-default">
                      Boards it reaches
                    </p>
                    <ul class="text-muted space-y-1">
                      <li v-if="key.allBoards">
                        All your boards, including ones you get later
                      </li>
                      <li
                        v-for="workspace in key.workspaces"
                        :key="workspace.teamId ?? 'personal'"
                      >
                        {{ workspace.teamId ? `All of ${workspace.name}` : 'Your personal boards' }}, including ones you get later
                      </li>
                      <li
                        v-for="board in key.reachedBoards"
                        :key="board.id"
                      >
                        <NuxtLink
                          :to="`/projects/${board.id}`"
                          class="text-primary underline"
                        >{{ board.name }}</NuxtLink>
                        · {{ board.workspace }}
                        <span v-if="board.readOnly">· read-only</span>
                      </li>
                    </ul>
                  </div>
                  <div
                    v-if="!key.editable"
                    class="flex flex-wrap items-center gap-2"
                  >
                    <UButton
                      :label="`Team key · ${key.teamName ?? 'a team'}`"
                      trailing-icon="i-lucide-arrow-right"
                      color="neutral"
                      variant="soft"
                      size="xs"
                      @click="openTeamKeys(key)"
                    />
                    <p class="text-xs text-muted">
                      A team owner or admin changes this key on the team's Keys page.
                    </p>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
