<script setup lang="ts">
import { format } from 'date-fns'

interface ReachWorkspace {
  teamId: string | null
  name: string | null
}

interface ReachBoard {
  id: string
  name: string
  teamId: string | null
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

function workspaceNameOf(teamId: string | null): string {
  if (teamId === null) return 'Personal'
  return workspaces.value.find(workspace => workspace.id === teamId)?.name ?? 'a team'
}

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
const claudeCommand = computed(() =>
  `${exportKeyCommand(issuedToken.value ?? '')}\n${mcpAddCommand(window.location.origin)}`
)

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

async function copyCommand() {
  if (!issuedToken.value) return
  try {
    await navigator.clipboard.writeText(claudeCommand.value)
    commandCopied.value = true
    toast.add({ title: 'Command copied', icon: 'i-lucide-check', duration: 2000 })
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
  openId.value = key.id
  editing.value = key.editable
    ? {
        scopes: Object.fromEntries(PERMISSIONS.map(permission => [permission.scope, key.scopes.includes(permission.scope)])),
        pick: {
          all: key.allBoards,
          workspaces: key.workspaces.map(workspace => wsKeyOf(workspace.teamId)),
          boards: key.boards.map(board => board.id)
        },
        saving: false
      }
    : null
}

const revoking = ref<string | null>(null)

async function revokeKey(key: ApiKeySummary) {
  revoking.value = key.id
  try {
    await $fetch(`/api/settings/api-keys/${key.id}`, { method: 'DELETE' })
    toast.add({ title: `Revoked "${key.name}"`, icon: 'i-lucide-trash', duration: 2000 })
    await refresh()
  } catch (e) {
    toast.add({ title: 'Could not revoke the key', description: errMsg(e), icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    revoking.value = null
  }
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
    toast.add({ title: 'Key saved', description: 'The secret is the same. The change applies to the key\'s next call.', icon: 'i-lucide-check', duration: 3000 })
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
              Or connect Claude Code in one go: these lines put the key in
              <code class="font-mono">$TASKMANAGER_API_KEY</code> and add the MCP server by that name only, so
              the key is never saved. Claude Code reads it on every start: keep the export in your shell
              profile, or run it before <code class="font-mono">claude</code>.
            </p>
            <div class="flex gap-2">
              <pre class="flex-1 min-w-0 text-xs font-mono bg-default border border-default rounded-md px-3 py-2 whitespace-pre-wrap break-all">{{ claudeCommand }}</pre>
              <UButton
                :icon="commandCopied ? 'i-lucide-check' : 'i-lucide-copy'"
                :label="commandCopied ? 'Copied' : 'Copy command'"
                color="neutral"
                variant="soft"
                size="sm"
                @click="copyCommand"
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
              Open a key to see what it reaches, or to change its permissions and boards. The secret stays the same.
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
                <!-- Editing a personal key -->
                <template v-if="key.editable && editing">
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
                    <UButton
                      label="Revoke"
                      icon="i-lucide-trash-2"
                      color="error"
                      variant="ghost"
                      size="sm"
                      class="ml-auto"
                      :loading="revoking === key.id"
                      @click="revokeKey(key)"
                    />
                  </div>
                  <p class="text-xs text-muted">
                    The secret stays the same, so no agent needs reconnecting. The change applies to the key's next call.
                  </p>
                </template>

                <!-- Read only: a team key, or a personal key's reach as it stands -->
                <template v-else>
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
                        v-for="board in key.boards"
                        :key="board.id"
                      >
                        <NuxtLink
                          :to="`/projects/${board.id}`"
                          class="text-primary underline"
                        >{{ board.name }}</NuxtLink>
                        · {{ workspaceNameOf(board.teamId) }}
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
