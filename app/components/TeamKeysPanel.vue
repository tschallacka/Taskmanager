<script setup lang="ts">
import { format } from 'date-fns'

// The team's API keys, for owners and admins: every key that works in the team, and a form that
// makes a key limited to the whole team, one customer or one board.
const props = defineProps<{ teamId: string }>()

interface TeamKey {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  createdAt: number
  lastUsedAt: number | null
  expiresAt: number | null
  owner: { id: string, name: string, email: string }
  limit: { type: 'team' | 'customer' | 'project', id: string, name: string | null }
}

const toast = useToast()
const { customers, refresh: refreshCustomers } = useCustomers()
const { projects } = useProjects()

const keys = ref<TeamKey[]>([])
const loading = ref(false)

function errMsg(e: unknown, fallback: string): string {
  return (e as { data?: { message?: string } })?.data?.message || (e as Error)?.message || fallback
}

async function load() {
  loading.value = true
  try {
    const res = await $fetch<{ keys: TeamKey[] }>(`/api/teams/${props.teamId}/keys`)
    keys.value = res.keys
  } catch (e) {
    toast.add({ title: errMsg(e, 'Could not load the keys'), icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    loading.value = false
  }
}

watch(() => props.teamId, () => {
  load()
  refreshCustomers().catch(() => {})
}, { immediate: true })

const REACH_OPTIONS = [
  { label: 'The whole team', value: 'team' },
  { label: 'One customer', value: 'customer' },
  { label: 'One board', value: 'project' }
]
const EXPIRY_OPTIONS = [
  { label: 'Never expires', value: 0 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '1 year', value: 365 }
]

const name = ref('')
const reach = ref<'team' | 'customer' | 'project'>('team')
const customerId = ref<string | undefined>(undefined)
const projectId = ref<string | undefined>(undefined)
const canWrite = ref(true)
const expiresInDays = ref(0)
const creating = ref(false)

const customerItems = computed(() => customers.value.map(c => ({ label: c.name, value: c.id })))
// Only boards the team itself works on: a customer's contact never makes team keys.
const boardItems = computed(() => projects.value
  .filter(p => p.audience !== 'customer' && !p.archivedAt)
  .map(p => ({ label: p.customerName ? `${p.name} (${p.customerName})` : p.name, value: p.id })))

watch(reach, () => {
  customerId.value = undefined
  projectId.value = undefined
})

const canCreate = computed(() => {
  if (!name.value.trim()) return false
  if (reach.value === 'customer') return Boolean(customerId.value)
  if (reach.value === 'project') return Boolean(projectId.value)
  return true
})

// The key itself only exists in this response: once it is dismissed it is gone.
const issued = ref<{ token: string, name: string } | null>(null)
const copied = ref(false)

async function createKey() {
  if (!canCreate.value) return
  creating.value = true
  try {
    const res = await $fetch<{ token: string }>(`/api/teams/${props.teamId}/keys`, {
      method: 'POST',
      body: {
        name: name.value.trim(),
        scopes: canWrite.value ? ['boards:read', 'boards:write'] : ['boards:read'],
        expiresInDays: expiresInDays.value || null,
        customerId: reach.value === 'customer' ? customerId.value : null,
        projectId: reach.value === 'project' ? projectId.value : null
      }
    })
    issued.value = { token: res.token, name: name.value.trim() }
    copied.value = false
    name.value = ''
    await load()
  } catch (e) {
    toast.add({ title: errMsg(e, 'Could not create the key'), icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    creating.value = false
  }
}

async function copyToken() {
  if (!issued.value) return
  try {
    await navigator.clipboard.writeText(issued.value.token)
    copied.value = true
  } catch {
    toast.add({ title: 'Could not copy: select the key and copy it manually', icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

const revoking = ref<string | null>(null)

async function revoke(key: TeamKey) {
  revoking.value = key.id
  try {
    await $fetch(`/api/teams/${props.teamId}/keys/${key.id}`, { method: 'DELETE' })
    toast.add({ title: `Revoked "${key.name}"`, icon: 'i-lucide-trash', duration: 2000 })
    await load()
  } catch (e) {
    toast.add({ title: errMsg(e, 'Could not revoke the key'), icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    revoking.value = null
  }
}

function limitLabel(limit: TeamKey['limit']): string {
  if (limit.type === 'project') return `Board: ${limit.name}`
  if (limit.type === 'customer') return `Customer: ${limit.name}`
  return 'Whole team'
}

function scopeLabel(scope: string): string {
  return scope.replace(':', ' ')
}

const day = (ms: number) => format(new Date(ms), 'd MMM yyyy')
</script>

<template>
  <div class="space-y-5 text-sm">
    <p class="text-xs text-muted">
      Keys let an AI agent work in this team through MCP. A key limited to one board or one customer reaches only that, and is not given the tools that work across the whole team (goals, portfolios, new boards, the inbox).
    </p>

    <!-- The key, once -->
    <div
      v-if="issued"
      class="rounded-xl border border-primary/40 bg-primary/5 p-4 space-y-2"
      data-team-key-issued
    >
      <p class="font-medium text-default">
        Key "{{ issued.name }}" is ready. Copy it now: it is not shown again.
      </p>
      <div class="flex items-center gap-2">
        <code class="min-w-0 flex-1 truncate rounded-lg bg-elevated px-2 py-1.5 font-mono text-xs">{{ issued.token }}</code>
        <UButton
          size="xs"
          color="primary"
          variant="soft"
          :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
          @click="copyToken"
        >
          {{ copied ? 'Copied!' : 'Copy' }}
        </UButton>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          @click="issued = null"
        >
          Done
        </UButton>
      </div>
    </div>

    <!-- New key -->
    <form
      class="rounded-xl border border-default p-4 space-y-3"
      @submit.prevent="createKey"
    >
      <p class="text-xs font-semibold text-muted uppercase tracking-wider">
        New key
      </p>
      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField label="Name">
          <UInput
            v-model="name"
            class="w-full"
            placeholder="e.g. Wren on Fundesign"
            maxlength="60"
          />
        </UFormField>
        <UFormField label="Reaches">
          <USelect
            v-model="reach"
            :items="REACH_OPTIONS"
            class="w-full"
            data-key-reach
          />
        </UFormField>
        <UFormField
          v-if="reach === 'customer'"
          label="Customer"
        >
          <USelect
            v-model="customerId"
            :items="customerItems"
            placeholder="Pick a customer"
            class="w-full"
          />
        </UFormField>
        <UFormField
          v-if="reach === 'project'"
          label="Board"
        >
          <USelect
            v-model="projectId"
            :items="boardItems"
            placeholder="Pick a board"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Expires">
          <USelect
            v-model="expiresInDays"
            :items="EXPIRY_OPTIONS"
            class="w-full"
          />
        </UFormField>
      </div>
      <UCheckbox
        v-model="canWrite"
        label="May change things (create, edit and move tasks), not only read"
      />
      <div class="flex justify-end">
        <UButton
          type="submit"
          icon="i-lucide-key-round"
          :loading="creating"
          :disabled="!canCreate"
        >
          Create key
        </UButton>
      </div>
    </form>

    <!-- Existing keys -->
    <div
      v-if="loading && keys.length === 0"
      class="py-4 text-center text-xs text-muted"
    >
      Loading…
    </div>
    <p
      v-else-if="keys.length === 0"
      class="py-4 text-center text-xs text-muted"
    >
      No keys in this team yet.
    </p>
    <div
      v-else
      class="divide-y divide-default rounded-xl border border-default overflow-hidden"
    >
      <div
        v-for="key in keys"
        :key="key.id"
        class="flex items-center gap-3 px-3 py-2.5"
        data-team-key
      >
        <div class="min-w-0 flex-1 space-y-0.5">
          <p class="flex flex-wrap items-center gap-1.5 font-medium text-default">
            <span class="truncate">{{ key.name }}</span>
            <UBadge
              size="xs"
              variant="subtle"
              :color="key.limit.type === 'team' ? 'neutral' : 'primary'"
            >
              {{ limitLabel(key.limit) }}
            </UBadge>
            <UBadge
              v-for="scope in key.scopes"
              :key="scope"
              size="xs"
              variant="outline"
              color="neutral"
            >
              {{ scopeLabel(scope) }}
            </UBadge>
          </p>
          <p class="text-[11px] text-muted">
            <span class="font-mono">{{ key.keyPrefix }}…</span>
            · {{ key.owner.name || key.owner.email }}
            · made {{ day(key.createdAt) }}
            · {{ key.lastUsedAt ? `used ${day(key.lastUsedAt)}` : 'never used' }}
            <template v-if="key.expiresAt">
              · expires {{ day(key.expiresAt) }}
            </template>
          </p>
        </div>
        <UButton
          icon="i-lucide-trash-2"
          size="xs"
          color="error"
          variant="ghost"
          aria-label="Revoke key"
          :loading="revoking === key.id"
          @click="revoke(key)"
        />
      </div>
    </div>
  </div>
</template>
