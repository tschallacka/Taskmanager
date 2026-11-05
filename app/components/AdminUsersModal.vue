<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })

interface InstanceUser {
  id: string
  name: string
  // Null when its owner keeps it private from you. You see your own, and one you typed in full.
  email: string | null
  createdAt: string
  isInstanceAdmin: boolean
  canCreateOrganizations: boolean
  organisations: { id: string, name: string, role: string }[]
}

const users = ref<InstanceUser[]>([])
const loading = ref(false)
const saving = ref<string | null>(null)
const search = ref('')
const toast = useToast()

// A complete address is looked up on the server, which then shows it. Anything else filters the list by
// name or organisation, since addresses are not in it.
const typedAddress = computed(() => {
  const value = search.value.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) ? value : null
})

async function load() {
  loading.value = true
  try {
    users.value = await $fetch<InstanceUser[]>('/api/admin/users', { query: typedAddress.value ? { email: typedAddress.value } : {} })
  } catch {
    toast.add({ title: 'Could not load accounts', icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    loading.value = false
  }
}

watch(open, (isOpen) => {
  if (isOpen) load()
  else search.value = ''
})

let timer: ReturnType<typeof setTimeout> | undefined
watch(typedAddress, (now, before) => {
  if (!open.value || now === before) return
  clearTimeout(timer)
  timer = setTimeout(load, 250)
})

const visible = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term || typedAddress.value) return users.value
  return users.value.filter(u => u.name.toLowerCase().includes(term) || u.organisations.some(o => o.name.toLowerCase().includes(term)))
})

async function setCanCreate(u: InstanceUser, value: boolean) {
  saving.value = u.id
  try {
    await $fetch(`/api/admin/users/${u.id}`, { method: 'PUT', body: { canCreateOrganizations: value } })
    u.canCreateOrganizations = value
  } catch {
    toast.add({ title: 'Could not change that account', icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    saving.value = null
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Accounts on this instance"
    description="Choose who may create organisations of their own. Taking the right away leaves organisations they already own in place. Email addresses are private: type a complete address to find one account."
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Name, organisation or a complete email address"
        class="mb-3 w-full"
        data-testid="admin-users-search"
      />
      <div
        v-if="loading"
        class="flex justify-center py-6"
      >
        <UIcon
          name="i-lucide-loader-2"
          class="size-5 animate-spin text-muted"
        />
      </div>
      <p
        v-else-if="!visible.length"
        class="py-4 text-center text-xs text-muted"
      >
        {{ typedAddress ? 'No account has that address.' : 'No account matches.' }}
      </p>
      <div
        v-else
        class="divide-y divide-default rounded-xl border border-default overflow-hidden text-sm"
      >
        <div
          v-for="u in visible"
          :key="u.id"
          class="flex items-center justify-between gap-3 px-3 py-2.5"
        >
          <div class="flex min-w-0 items-center gap-2.5">
            <UAvatar
              :alt="u.name"
              size="xs"
            />
            <div class="min-w-0">
              <p class="truncate text-xs font-medium text-default">
                {{ u.name }}
                <UBadge
                  v-if="u.isInstanceAdmin"
                  size="xs"
                  variant="subtle"
                  class="ml-1"
                >
                  admin
                </UBadge>
              </p>
              <p
                v-if="u.email"
                class="truncate text-[11px] text-muted"
              >
                {{ u.email }}
              </p>
              <p
                class="truncate text-[11px] text-muted"
                :title="u.organisations.map(o => `${o.name} (${o.role})`).join(', ')"
              >
                {{ u.organisations.length ? u.organisations.map(o => o.name).join(', ') : 'No organisation' }}
              </p>
            </div>
          </div>
          <USwitch
            :model-value="u.canCreateOrganizations"
            :disabled="u.isInstanceAdmin || saving === u.id"
            label="Can create organisations"
            :ui="{ label: 'text-xs text-muted' }"
            @update:model-value="(value: boolean) => setCanCreate(u, value)"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
