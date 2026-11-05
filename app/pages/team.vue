<script setup lang="ts">
definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Team' })

const {
  activeTeam,
  activeTeamId,
  activeTeamMembers,
  isTeamOwner,
  isTeamAdmin,
  mustTransferBeforeLeaving,
  updateTeamName,
  rotateJoinCode,
  removeMember,
  transferOwnership,
  leaveTeam,
  deleteTeam
} = useTeams()
const { session } = useAuth()
const { refresh: refreshProjects } = useProjects()
const { customers, canManageCustomers, refresh: refreshCustomers } = useCustomers()
const toast = useToast()
const route = useRoute()

function errMsg(e: unknown, fallback: string): string {
  return (e as { data?: { message?: string } })?.data?.message || (e as Error)?.message || fallback
}

function fail(e: unknown, fallback: string) {
  toast.add({ title: errMsg(e, fallback), icon: 'i-lucide-alert-triangle', color: 'error' })
}

// ─── Sections ────────────────────────────────────────────────

// Keys are for owners and admins: the section is not offered to a member, and the server refuses them too.
const SECTIONS = computed(() => [
  { id: 'general', label: 'General', icon: 'i-lucide-settings-2' },
  { id: 'members', label: 'Members', icon: 'i-lucide-users' },
  { id: 'customers', label: 'Customers', icon: 'i-lucide-building-2' },
  { id: 'boards', label: 'Board defaults', icon: 'i-lucide-columns-3' },
  { id: 'rules', label: 'Rules', icon: 'i-lucide-workflow' },
  { id: 'crews', label: 'Crews', icon: 'i-lucide-users-round' },
  ...(isTeamAdmin.value ? [{ id: 'keys', label: 'Keys', icon: 'i-lucide-key-round' }] : [])
])

const section = computed(() => {
  const wanted = String(route.query.section ?? 'general')
  return SECTIONS.value.some(s => s.id === wanted) ? wanted : 'general'
})

function openSection(id: string) {
  navigateTo({ path: '/team', query: { section: id } }, { replace: true })
}

// ─── Name ────────────────────────────────────────────────────

const nameInput = ref('')
const nameSaving = ref(false)

watch(activeTeam, (team) => {
  nameInput.value = team?.name ?? ''
}, { immediate: true })

const nameChanged = computed(() => nameInput.value.trim() !== '' && nameInput.value.trim() !== activeTeam.value?.name)

async function saveName() {
  if (!activeTeamId.value || !nameChanged.value) return
  nameSaving.value = true
  try {
    await updateTeamName(activeTeamId.value, nameInput.value.trim())
    toast.add({ title: 'Team name saved', icon: 'i-lucide-check', duration: 2000 })
  } catch (e) {
    fail(e, 'Could not rename the team')
  } finally {
    nameSaving.value = false
  }
}

// ─── Join code ───────────────────────────────────────────────

const copiedCode = ref(false)
const generatingCode = ref(false)

async function generateCode() {
  if (!activeTeamId.value) return
  generatingCode.value = true
  try {
    await rotateJoinCode(activeTeamId.value)
  } catch (e) {
    fail(e, 'Could not generate a join code')
  } finally {
    generatingCode.value = false
  }
}

async function copyCode() {
  if (!activeTeam.value?.joinCode) return
  try {
    await navigator.clipboard.writeText(activeTeam.value.joinCode)
    copiedCode.value = true
    setTimeout(() => {
      copiedCode.value = false
    }, 2000)
  } catch {
    toast.add({ title: 'Could not copy automatically', description: 'Select and copy the code manually.', icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

// ─── Confirmation dialog ─────────────────────────────────────

interface ConfirmRequest {
  title: string
  description: string
  confirmLabel: string
  color: 'error' | 'warning'
  action: () => Promise<unknown> | unknown
}

const confirmRequest = ref<ConfirmRequest | null>(null)
const confirmLoading = ref(false)
const isConfirmOpen = computed({
  get: () => confirmRequest.value !== null,
  set: (val) => {
    if (!val) confirmRequest.value = null
  }
})

async function acceptConfirm() {
  if (!confirmRequest.value) return
  confirmLoading.value = true
  try {
    await confirmRequest.value.action()
    confirmRequest.value = null
  } catch (e) {
    fail(e, 'Something went wrong')
  } finally {
    confirmLoading.value = false
  }
}

function confirmRotateCode() {
  if (!activeTeamId.value) return
  const organizationId = activeTeamId.value
  confirmRequest.value = {
    title: 'Rotate join code?',
    description: 'The current join code will stop working immediately. Anyone with the old code will no longer be able to join.',
    confirmLabel: 'Rotate',
    color: 'warning',
    action: () => rotateJoinCode(organizationId)
  }
}

function personName(m: { user?: { name?: string, email?: string } }): string {
  return m.user?.name || m.user?.email || 'this member'
}

function confirmRemoveMember(memberId: string, name: string) {
  confirmRequest.value = {
    title: 'Remove member?',
    description: `Remove ${name} from ${activeTeam.value?.name}? They will lose access to the team's boards.`,
    confirmLabel: 'Remove',
    color: 'error',
    action: () => removeMember(memberId)
  }
}

function confirmTransferOwnership(memberId: string, name: string) {
  confirmRequest.value = {
    title: 'Transfer ownership?',
    description: `Make ${name} the new owner of ${activeTeam.value?.name}? You will become an admin.`,
    confirmLabel: 'Transfer',
    color: 'warning',
    action: () => transferOwnership(memberId)
  }
}

async function leftTheTeam() {
  // Dropped back to the personal workspace: its boards and customers are what the app shows now.
  await refreshProjects()
  await refreshCustomers().catch(() => {})
  await navigateTo('/projects', { replace: true })
}

function confirmLeaveTeam() {
  if (!activeTeamId.value) return
  const organizationId = activeTeamId.value
  const isLastMember = activeTeamMembers.value.length === 1
  confirmRequest.value = {
    title: isLastMember ? 'Delete this team?' : 'Leave this team?',
    description: isLastMember
      ? `You're the only member of ${activeTeam.value?.name}. Leaving will permanently delete the team and all of its boards.`
      : `Are you sure you want to leave ${activeTeam.value?.name}?`,
    confirmLabel: isLastMember ? 'Delete Team' : 'Leave Team',
    color: 'error',
    action: async () => {
      await leaveTeam(organizationId)
      await leftTheTeam()
    }
  }
}

function confirmDeleteTeam() {
  if (!activeTeamId.value) return
  const organizationId = activeTeamId.value
  confirmRequest.value = {
    title: 'Delete this team?',
    description: `Are you sure you want to delete ${activeTeam.value?.name}? This will permanently delete the team and all of its boards. This action cannot be undone.`,
    confirmLabel: 'Delete Team',
    color: 'error',
    action: async () => {
      await deleteTeam(organizationId)
      await leftTheTeam()
    }
  }
}

// What each role may do.
const ROLE_HINTS: Record<string, string> = {
  owner: 'Owner: can transfer ownership, invite members and admins by email, remove members and rotate the join code.',
  admin: 'Admin: can invite members by email, remove members and rotate the join code.',
  member: 'Member: cannot invite or remove people, or rotate the join code.'
}

// ─── Customers ───────────────────────────────────────────────

const showCustomersModal = ref(false)

// ─── Board defaults ──────────────────────────────────────────

interface TeamSettingsResponse {
  defaultColumns: string[]
  usingBuiltIn: boolean
  builtInColumns: string[]
}

const settings = ref<TeamSettingsResponse | null>(null)
const columnDraft = ref<string[]>([])
const newColumn = ref('')
const columnsSaving = ref(false)

async function loadSettings() {
  settings.value = null
  if (!activeTeamId.value) return
  try {
    const res = await $fetch<TeamSettingsResponse>(`/api/teams/${activeTeamId.value}/settings`)
    settings.value = res
    columnDraft.value = [...res.defaultColumns]
  } catch (e) {
    fail(e, 'Could not load the team settings')
  }
}

watch(activeTeamId, () => {
  loadSettings()
  refreshCustomers().catch(() => {})
}, { immediate: true })

const columnsChanged = computed(() => {
  const saved = settings.value?.defaultColumns ?? []
  return columnDraft.value.length !== saved.length || columnDraft.value.some((name, i) => name !== saved[i])
})

function addColumn() {
  const name = newColumn.value.trim()
  if (!name) return
  if (columnDraft.value.some(existing => existing.toLowerCase() === name.toLowerCase())) {
    toast.add({ title: `"${name}" is already in the list`, icon: 'i-lucide-alert-triangle', color: 'warning' })
    return
  }
  columnDraft.value = [...columnDraft.value, name]
  newColumn.value = ''
}

function removeColumn(index: number) {
  columnDraft.value = columnDraft.value.filter((_, i) => i !== index)
}

function moveColumn(index: number, by: -1 | 1) {
  const target = index + by
  if (target < 0 || target >= columnDraft.value.length) return
  const next = [...columnDraft.value]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved!)
  columnDraft.value = next
}

async function saveColumns(names: string[]) {
  if (!activeTeamId.value) return
  columnsSaving.value = true
  try {
    const res = await $fetch<Pick<TeamSettingsResponse, 'defaultColumns' | 'usingBuiltIn'>>(`/api/teams/${activeTeamId.value}/settings`, {
      method: 'PUT',
      body: { defaultColumns: names }
    })
    settings.value = { ...(settings.value as TeamSettingsResponse), ...res }
    columnDraft.value = [...res.defaultColumns]
    toast.add({ title: res.usingBuiltIn ? 'Back to the built-in columns' : 'Board defaults saved', icon: 'i-lucide-check', duration: 2000 })
  } catch (e) {
    fail(e, 'Could not save the board defaults')
  } finally {
    columnsSaving.value = false
  }
}
</script>

<template>
  <div class="flex-1 min-w-0 flex flex-col overflow-hidden pb-14 lg:pb-0">
    <div class="sticky top-0 z-10 border-b border-default bg-default/95 backdrop-blur-sm shrink-0">
      <div class="px-4 pt-3.5 pb-3 flex items-center gap-3">
        <h1 class="font-semibold text-sm">
          {{ activeTeam ? activeTeam.name : 'Team' }}
        </h1>
        <UBadge
          v-if="activeTeam"
          size="xs"
          variant="subtle"
          color="neutral"
        >
          {{ activeTeamMembers.length }} {{ activeTeamMembers.length === 1 ? 'member' : 'members' }}
        </UBadge>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto">
      <UContainer class="py-6">
        <div
          v-if="!activeTeam"
          class="rounded-xl border border-default p-6 text-sm text-muted"
          data-team-none
        >
          You are in your personal workspace. Pick a team in the workspace menu to see its settings.
        </div>

        <div
          v-else
          class="flex flex-col gap-6 md:flex-row"
        >
          <nav
            class="flex shrink-0 gap-1 md:w-48 md:flex-col"
            aria-label="Team sections"
          >
            <UButton
              v-for="s in SECTIONS"
              :key="s.id"
              :icon="s.icon"
              :label="s.label"
              :data-team-section="s.id"
              size="sm"
              color="neutral"
              :variant="section === s.id ? 'soft' : 'ghost'"
              class="justify-start"
              @click="openSection(s.id)"
            />
          </nav>

          <div class="min-w-0 flex-1 space-y-6 text-sm">
            <!-- General -->
            <template v-if="section === 'general'">
              <div class="rounded-xl border border-default p-4 space-y-2">
                <p class="text-xs font-semibold text-muted uppercase tracking-wider">
                  Team name
                </p>
                <form
                  v-if="isTeamAdmin"
                  class="flex items-center gap-2"
                  @submit.prevent="saveName"
                >
                  <UInput
                    v-model="nameInput"
                    class="flex-1"
                    required
                  />
                  <UButton
                    type="submit"
                    size="sm"
                    :loading="nameSaving"
                    :disabled="!nameChanged"
                  >
                    Save
                  </UButton>
                </form>
                <p
                  v-else
                  class="font-medium text-default"
                >
                  {{ activeTeam.name }}
                </p>
              </div>

              <div class="rounded-xl border border-default p-4 bg-primary/5 flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-xs font-semibold text-muted uppercase tracking-wider">
                    Team join code
                  </p>
                  <p
                    v-if="activeTeam.joinCode"
                    class="font-mono text-sm font-bold text-primary truncate"
                  >
                    {{ activeTeam.joinCode }}
                  </p>
                  <p
                    v-else
                    class="text-sm text-muted"
                  >
                    No code yet
                  </p>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <UButton
                    v-if="isTeamAdmin && !activeTeam.joinCode"
                    size="xs"
                    color="primary"
                    variant="soft"
                    icon="i-lucide-key-round"
                    :loading="generatingCode"
                    @click="generateCode"
                  >
                    Generate Code
                  </UButton>
                  <template v-if="activeTeam.joinCode">
                    <UButton
                      v-if="isTeamAdmin"
                      size="xs"
                      color="neutral"
                      variant="soft"
                      icon="i-lucide-refresh-cw"
                      @click="confirmRotateCode"
                    >
                      Rotate
                    </UButton>
                    <UButton
                      size="xs"
                      color="primary"
                      variant="soft"
                      :icon="copiedCode ? 'i-lucide-check' : 'i-lucide-copy'"
                      @click="copyCode"
                    >
                      {{ copiedCode ? 'Copied!' : 'Copy Code' }}
                    </UButton>
                  </template>
                </div>
              </div>
              <p class="-mt-4 text-xs text-muted">
                Anyone signed in with this code can join. Owners and admins can rotate it, and the old code stops working at once.
              </p>

              <div class="border-t border-default pt-4 flex flex-wrap justify-between gap-2">
                <UTooltip
                  :text="mustTransferBeforeLeaving ? 'Transfer ownership to another member before leaving.' : undefined"
                  :disabled="!mustTransferBeforeLeaving"
                >
                  <UButton
                    color="warning"
                    variant="soft"
                    size="xs"
                    icon="i-lucide-log-out"
                    :disabled="mustTransferBeforeLeaving"
                    @click="confirmLeaveTeam"
                  >
                    Leave Team
                  </UButton>
                </UTooltip>
                <UButton
                  v-if="isTeamOwner"
                  color="error"
                  variant="soft"
                  size="xs"
                  icon="i-lucide-trash-2"
                  @click="confirmDeleteTeam"
                >
                  Delete Team
                </UButton>
              </div>
            </template>

            <!-- Members -->
            <template v-else-if="section === 'members'">
              <TeamInvitesPanel
                v-if="isTeamAdmin && activeTeamId"
                :team-id="activeTeamId"
                :is-owner="isTeamOwner"
              />
              <div class="space-y-2">
                <p class="text-xs text-muted">
                  Every member of the team can see these email addresses.
                </p>
                <p class="text-xs text-muted">
                  Owner: can remove members, transfer ownership and rotate the join code. Admin: can remove members and rotate the join code. Member: cannot remove anyone or rotate the join code.
                </p>
                <div
                  v-if="activeTeamMembers.length === 0"
                  class="py-4 text-center text-xs text-muted"
                >
                  No members listed.
                </div>
                <div
                  v-else
                  class="divide-y divide-default rounded-xl border border-default overflow-hidden"
                >
                  <div
                    v-for="m in activeTeamMembers"
                    :key="m.id"
                    class="flex items-center justify-between px-3 py-2.5 bg-elevated/10"
                    data-team-member
                  >
                    <div class="flex items-center gap-2.5 min-w-0">
                      <UAvatar
                        :alt="m.user?.name || m.user?.email || 'M'"
                        size="xs"
                      />
                      <div class="min-w-0">
                        <p class="font-medium text-default truncate text-xs">
                          {{ m.user?.name || m.user?.email }}
                          <span
                            v-if="m.userId === session?.user?.id"
                            class="text-muted font-normal"
                          >(you)</span>
                        </p>
                        <p
                          v-if="m.user?.name"
                          class="text-[11px] text-muted truncate"
                        >
                          {{ m.user?.email }}
                        </p>
                      </div>
                    </div>

                    <div class="flex items-center gap-2 shrink-0">
                      <UBadge
                        size="xs"
                        variant="subtle"
                        :color="m.role === 'owner' ? 'primary' : 'neutral'"
                        :title="ROLE_HINTS[m.role]"
                      >
                        {{ m.role }}
                      </UBadge>
                      <template v-if="m.userId !== session?.user?.id">
                        <UButton
                          v-if="isTeamOwner && m.role !== 'owner'"
                          icon="i-lucide-crown"
                          size="xs"
                          color="neutral"
                          variant="ghost"
                          aria-label="Transfer ownership"
                          @click="confirmTransferOwnership(m.id, personName(m))"
                        />
                        <UButton
                          v-if="isTeamAdmin"
                          icon="i-lucide-trash-2"
                          size="xs"
                          color="error"
                          variant="ghost"
                          aria-label="Remove member"
                          @click="confirmRemoveMember(m.id, personName(m))"
                        />
                      </template>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- Customers -->
            <template v-else-if="section === 'customers'">
              <div class="flex items-center justify-between gap-3">
                <p class="flex items-start gap-1.5 text-xs text-muted">
                  <span>Customers group projects and log in to follow them. They see only the tasks you share with them.</span>
                  <HelpHint page="team/customers-and-contacts">
                    A customer is a client with projects and logins of their own. A new task is shared with the customer by default, so check what a board shows before you file it under one.
                  </HelpHint>
                </p>
                <UButton
                  size="sm"
                  icon="i-lucide-building-2"
                  @click="showCustomersModal = true"
                >
                  {{ canManageCustomers ? 'Manage customers' : 'View customers' }}
                </UButton>
              </div>
              <p
                v-if="customers.length === 0"
                class="py-6 text-center text-xs text-muted"
              >
                No customers yet.
              </p>
              <div
                v-else
                class="divide-y divide-default rounded-xl border border-default overflow-hidden"
              >
                <div
                  v-for="c in customers"
                  :key="c.id"
                  class="flex items-center justify-between gap-3 px-3 py-2.5"
                  data-team-customer
                >
                  <span class="min-w-0 truncate font-medium text-default">{{ c.name }}</span>
                  <span class="shrink-0 text-xs text-muted">
                    {{ c.projectCount }} {{ c.projectCount === 1 ? 'project' : 'projects' }} · {{ c.contactCount }} {{ c.contactCount === 1 ? 'contact' : 'contacts' }}
                  </span>
                </div>
              </div>
            </template>

            <!-- Board defaults -->
            <template v-else-if="section === 'boards'">
              <p class="flex items-start gap-1.5 text-xs text-muted">
                <span>A new board of this team starts with these columns, in this order. Boards that already exist keep theirs.</span>
                <HelpHint page="team/board-defaults">
                  Changing these only affects boards made from now on. A team rule that names a column skips every board that has no column of that name.
                </HelpHint>
              </p>
              <div
                v-if="!settings"
                class="py-6 text-center text-xs text-muted"
              >
                Loading…
              </div>
              <template v-else>
                <div
                  class="divide-y divide-default rounded-xl border border-default overflow-hidden"
                  data-board-defaults
                >
                  <div
                    v-for="(name, i) in columnDraft"
                    :key="name"
                    class="flex items-center gap-2 px-3 py-2"
                  >
                    <span class="min-w-0 flex-1 truncate text-default">{{ name }}</span>
                    <template v-if="isTeamAdmin">
                      <UButton
                        icon="i-lucide-arrow-up"
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        aria-label="Move up"
                        :disabled="i === 0"
                        @click="moveColumn(i, -1)"
                      />
                      <UButton
                        icon="i-lucide-arrow-down"
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        aria-label="Move down"
                        :disabled="i === columnDraft.length - 1"
                        @click="moveColumn(i, 1)"
                      />
                      <UButton
                        icon="i-lucide-x"
                        size="xs"
                        color="error"
                        variant="ghost"
                        aria-label="Remove column"
                        @click="removeColumn(i)"
                      />
                    </template>
                  </div>
                </div>

                <form
                  v-if="isTeamAdmin"
                  class="flex items-center gap-2"
                  @submit.prevent="addColumn"
                >
                  <UInput
                    v-model="newColumn"
                    placeholder="New column name"
                    class="flex-1"
                    maxlength="40"
                  />
                  <UButton
                    type="submit"
                    icon="i-lucide-plus"
                    color="neutral"
                    variant="soft"
                    :disabled="!newColumn.trim()"
                  >
                    Add
                  </UButton>
                </form>

                <div
                  v-if="isTeamAdmin"
                  class="flex flex-wrap items-center gap-2"
                >
                  <UButton
                    :loading="columnsSaving"
                    :disabled="!columnsChanged || columnDraft.length === 0"
                    @click="saveColumns(columnDraft)"
                  >
                    Save
                  </UButton>
                  <UButton
                    color="neutral"
                    variant="ghost"
                    :disabled="settings.usingBuiltIn || columnsSaving"
                    @click="saveColumns([])"
                  >
                    Use the built-in columns
                  </UButton>
                  <span
                    v-if="settings.usingBuiltIn"
                    class="text-xs text-muted"
                  >
                    Using the built-in columns.
                  </span>
                </div>
                <p
                  v-else
                  class="text-xs text-muted"
                >
                  Only team owners and admins change these.
                </p>
              </template>
            </template>

            <!-- Rules -->
            <TeamRulesPanel
              v-else-if="section === 'rules'"
              :team-id="activeTeam.id"
            />

            <!-- Crews -->
            <TeamCrewsPanel
              v-else-if="section === 'crews'"
              :team-id="activeTeam.id"
            />

            <!-- Keys -->
            <TeamKeysPanel
              v-else-if="section === 'keys'"
              :team-id="activeTeam.id"
            />
          </div>
        </div>
      </UContainer>
    </div>

    <CustomersModal v-model:open="showCustomersModal" />

    <UModal
      v-model:open="isConfirmOpen"
      :title="confirmRequest?.title"
      :description="confirmRequest?.description"
    >
      <template #body>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="soft"
            :disabled="confirmLoading"
            @click="isConfirmOpen = false"
          >
            Cancel
          </UButton>
          <UButton
            :color="confirmRequest?.color"
            :loading="confirmLoading"
            @click="acceptConfirm"
          >
            {{ confirmRequest?.confirmLabel }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
