<script setup lang="ts">
import { refreshBrand, useBrand } from '~/composables/useBrand'
import { BRAND_LOGO_MAX_BYTES, BRAND_NAME_MAX_LENGTH } from '../../../shared/utils/brand'

definePageMeta({ layout: 'app', middleware: 'instance-admin' })

useSeoMeta({ title: 'Instance settings' })

const { isInstanceAdmin, isPending: sessionPending } = useAuth()
const toast = useToast()
const { sidebarOpen } = useSidebar()

function errMsg(e: unknown): string | undefined {
  return (e as { data?: { message?: string } })?.data?.message
}

interface SprocketView {
  forEveryone: boolean
  model: string
  keySet: boolean
  keyMasked: string | null
  userDailyLimit: number
  instanceDailyCap: number
  defaultManner: string
  keyProblem: string | null
  claudeForEveryone: boolean
  claudeEnvSetting: 'true' | 'false' | null
}

interface BrandAdmin {
  name: string
  customName: string | null
  customLogo: boolean
}

// Nothing is fetched until the session says who is asking: a visitor who is not the instance admin never sends these.
const { data: sprocket, refresh: refreshSprocket } = useFetch<SprocketView>('/api/admin/sprocket', { server: false, immediate: false })
const { data: brandAdmin, refresh: refreshBrandAdmin } = useFetch<BrandAdmin>('/api/admin/brand', { server: false, immediate: false })
const { data: brand } = useBrand()

// The route middleware (instance-admin) answers anyone else with a 404. Here the admin's data is fetched once the
// session says who is asking.
watch([sessionPending, isInstanceAdmin], ([pending, admin]) => {
  if (pending || !admin) return
  refreshSprocket()
  refreshBrandAdmin()
}, { immediate: true })

// Drafts: what the admin is typing. They follow the saved values until the admin edits them.
const modelDraft = ref('')
const userLimitDraft = ref('200')
const capDraft = ref('2000')
const keyDraft = ref('')
const nameDraft = ref('')

watch(sprocket, (value) => {
  if (!value) return
  modelDraft.value = value.model
  userLimitDraft.value = String(value.userDailyLimit)
  capDraft.value = String(value.instanceDailyCap)
}, { immediate: true })

watch(brandAdmin, (value) => {
  if (!value) return
  nameDraft.value = value.customName ?? ''
}, { immediate: true })

const busy = ref<string | null>(null)

async function saveSprocket(patch: Record<string, unknown>, done = 'Saved', id = 'sprocket') {
  busy.value = id
  try {
    sprocket.value = await $fetch<SprocketView>('/api/admin/sprocket', { method: 'PUT', body: patch })
    toast.add({ title: done, icon: 'i-lucide-check', duration: 1500 })
    return true
  } catch (e) {
    toast.add({ title: 'Could not save', description: errMsg(e), icon: 'i-lucide-alert-triangle', color: 'error' })
    return false
  } finally {
    busy.value = null
  }
}

// The first key turns Sprocket for everyone on; after that the switch is the admin's to set.
async function saveKey() {
  const key = keyDraft.value.trim()
  if (!key) return
  const firstKey = !sprocket.value?.keySet
  const saved = await saveSprocket(firstKey ? { apiKey: key, forEveryone: true } : { apiKey: key }, 'OpenRouter key saved')
  if (saved) keyDraft.value = ''
}

async function clearKey() {
  await saveSprocket({ apiKey: null }, 'OpenRouter key removed')
}

async function saveModel() {
  const model = modelDraft.value.trim()
  if (!model) return
  await saveSprocket({ model }, 'Model saved')
}

async function saveLimits() {
  await saveSprocket({ userDailyLimit: Number(userLimitDraft.value), instanceDailyCap: Number(capDraft.value) }, 'Limits saved')
}

const MANNERS = [
  { label: 'Professional', value: 'professional' },
  { label: 'Friendly', value: 'friendly' },
  { label: 'Concise', value: 'concise' },
  { label: 'Playful', value: 'playful' },
  { label: 'Teacher', value: 'teacher' }
]

async function saveDefaultManner(value: string) {
  await saveSprocket({ defaultManner: value }, 'Default manner saved')
}

// Branding. An empty name, or a reset, puts the default back.

async function saveName() {
  const name = nameDraft.value.trim()
  busy.value = 'brand'
  try {
    brandAdmin.value = await $fetch<BrandAdmin>('/api/admin/brand', { method: 'PUT', body: { name: name || null } })
    await refreshBrand()
    toast.add({ title: name ? 'App name saved' : 'App name reset', icon: 'i-lucide-check', duration: 1500 })
  } catch (e) {
    toast.add({ title: 'Could not save the name', description: errMsg(e), icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    busy.value = null
  }
}

async function saveLogo(svg: string | null, done: string) {
  busy.value = 'brand'
  try {
    brandAdmin.value = await $fetch<BrandAdmin>('/api/admin/brand', { method: 'PUT', body: { logoSvg: svg } })
    await refreshBrand()
    toast.add({ title: done, icon: 'i-lucide-check', duration: 1500 })
  } catch (e) {
    toast.add({ title: 'Could not save the logo', description: errMsg(e), icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    busy.value = null
  }
}

async function onLogoPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.size > BRAND_LOGO_MAX_BYTES || !(file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg'))) {
    toast.add({ title: `The logo is an SVG file of at most ${BRAND_LOGO_MAX_BYTES / 1000} KB`, icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  await saveLogo(await file.text(), 'Logo saved')
}

// Links to the other instance-wide places, so this page is the one place to start.
const accountsOpen = ref(false)
</script>

<template>
  <div class="h-full overflow-y-auto px-4 pb-10 pt-6 lg:px-6">
    <div class="mx-auto max-w-4xl space-y-8">
      <div class="flex items-center gap-3">
        <UButton
          v-if="!sidebarOpen"
          icon="i-lucide-panel-left"
          color="neutral"
          variant="ghost"
          size="sm"
          class="lg:hidden"
          aria-label="Open sidebar"
          @click="sidebarOpen = true"
        />
        <div class="flex-1 min-w-0">
          <h1 class="text-xl font-semibold text-default">
            Instance settings
          </h1>
          <p class="text-sm text-muted">
            For everyone on this Taskmanager. Only the instance admin sees this page.
          </p>
        </div>
      </div>

      <!-- Sprocket -->
      <section
        id="sprocket-settings"
        class="rounded-xl border border-default bg-default overflow-hidden"
        aria-labelledby="sprocket-heading"
      >
        <div class="px-5 py-3 border-b border-default bg-elevated/40 flex items-center gap-2">
          <UIcon
            name="i-lucide-cog"
            class="size-4 text-primary"
          />
          <h2
            id="sprocket-heading"
            class="text-xs font-semibold text-muted uppercase tracking-wider"
          >
            Sprocket
          </h2>
          <HelpHint page="agents/sprocket">
            Sprocket is the assistant in the chat panel. Here the instance sets it up for everyone.
          </HelpHint>
        </div>

        <div
          v-if="sprocket"
          class="p-5 space-y-6"
        >
          <UAlert
            v-if="sprocket.keyProblem"
            color="warning"
            variant="subtle"
            icon="i-lucide-alert-triangle"
            :title="sprocket.keyProblem"
          />

          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-sm font-medium">
                Sprocket for everyone
              </p>
              <p class="text-xs text-muted mt-1">
                Every signed-in user gets Sprocket in the chat panel, answered on the key and model below. A user who set
                their own Sprocket keeps using it.
              </p>
            </div>
            <USwitch
              id="sprocket-for-everyone"
              :model-value="sprocket.forEveryone"
              :disabled="busy === 'sprocket' || !sprocket.keySet"
              aria-label="Sprocket for everyone"
              @update:model-value="(v: boolean) => saveSprocket({ forEveryone: v }, v ? 'Sprocket is on for everyone' : 'Sprocket is off for everyone')"
            />
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <p class="text-sm font-medium mb-1">
                Provider
              </p>
              <p class="text-sm text-muted">
                OpenRouter
              </p>
            </div>
            <div>
              <label
                for="sprocket-model"
                class="text-sm font-medium mb-1 block"
              >Model</label>
              <div class="flex gap-2">
                <UInput
                  id="sprocket-model"
                  v-model="modelDraft"
                  placeholder="openai/gpt-4o-mini"
                  class="flex-1 min-w-0"
                />
                <UButton
                  color="neutral"
                  variant="soft"
                  :loading="busy === 'sprocket'"
                  :disabled="!modelDraft.trim() || modelDraft.trim() === sprocket.model"
                  @click="saveModel"
                >
                  Save
                </UButton>
              </div>
            </div>
          </div>

          <div>
            <p class="text-sm font-medium mb-1">
              OpenRouter key
            </p>
            <p class="text-xs text-muted mb-2">
              Stored encrypted. Only the last four characters are ever shown. Nobody gets the full key back, not even this page.
            </p>
            <p
              id="sprocket-key-state"
              class="text-sm mb-2"
            >
              <span v-if="sprocket.keySet">Key set: <code class="font-mono">{{ sprocket.keyMasked }}</code></span>
              <span
                v-else
                class="text-muted"
              >No key set. Sprocket for everyone stays off until one is.</span>
            </p>
            <div class="flex flex-wrap gap-2">
              <UInput
                id="sprocket-key"
                v-model="keyDraft"
                type="password"
                autocomplete="off"
                placeholder="Paste a new key"
                aria-label="New OpenRouter key"
                class="flex-1 min-w-[12rem]"
              />
              <UButton
                :disabled="!keyDraft.trim() || !!sprocket.keyProblem"
                :loading="busy === 'sprocket'"
                @click="saveKey"
              >
                Save key
              </UButton>
              <UButton
                v-if="sprocket.keySet"
                color="error"
                variant="soft"
                :disabled="busy === 'sprocket'"
                @click="clearKey"
              >
                Remove key
              </UButton>
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                for="sprocket-user-limit"
                class="text-sm font-medium mb-1 block"
              >Messages per user per day</label>
              <UInput
                id="sprocket-user-limit"
                v-model="userLimitDraft"
                type="number"
                min="1"
                class="w-full"
              />
            </div>
            <div>
              <label
                for="sprocket-cap"
                class="text-sm font-medium mb-1 block"
              >Messages per day for the whole instance</label>
              <UInput
                id="sprocket-cap"
                v-model="capDraft"
                type="number"
                min="1"
                class="w-full"
              />
            </div>
          </div>
          <div class="-mt-3 flex justify-end">
            <UButton
              color="neutral"
              variant="soft"
              :loading="busy === 'sprocket'"
              @click="saveLimits"
            >
              Save limits
            </UButton>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                for="sprocket-manner"
                class="text-sm font-medium mb-1 block"
              >Default manner</label>
              <USelect
                id="sprocket-manner"
                :model-value="sprocket.defaultManner"
                :items="MANNERS"
                value-key="value"
                class="w-full"
                @update:model-value="(v: string) => saveDefaultManner(v)"
              />
              <p class="text-xs text-muted mt-1">
                Used by everyone who has not picked one. A user's own pick wins.
              </p>
            </div>
          </div>

          <div class="flex items-start justify-between gap-4 border-t border-default pt-5">
            <div>
              <p class="text-sm font-medium">
                Claude Code for everyone
              </p>
              <p class="text-xs text-muted mt-1">
                Lets every user choose Claude Code, which runs on the server's own Claude login. Off by default.
              </p>
              <p
                v-if="sprocket.claudeEnvSetting"
                class="text-xs text-warning mt-1"
              >
                SPROCKET_CLAUDE_FOR_ALL is set to {{ sprocket.claudeEnvSetting }} on this server, so that setting decides and this switch is locked.
              </p>
            </div>
            <USwitch
              id="claude-for-everyone"
              :model-value="sprocket.claudeEnvSetting ? sprocket.claudeEnvSetting === 'true' : sprocket.claudeForEveryone"
              :disabled="busy === 'sprocket' || !!sprocket.claudeEnvSetting"
              aria-label="Claude Code for everyone"
              @update:model-value="(v: boolean) => saveSprocket({ claudeForEveryone: v }, v ? 'Claude Code is open to everyone' : 'Claude Code is for the instance admin only')"
            />
          </div>
        </div>
        <div
          v-else
          class="p-5 text-sm text-muted"
        >
          Loading Sprocket settings.
        </div>
      </section>

      <!-- Branding -->
      <section
        id="branding-settings"
        class="rounded-xl border border-default bg-default overflow-hidden"
        aria-labelledby="branding-heading"
      >
        <div class="px-5 py-3 border-b border-default bg-elevated/40 flex items-center gap-2">
          <UIcon
            name="i-lucide-palette"
            class="size-4 text-primary"
          />
          <h2
            id="branding-heading"
            class="text-xs font-semibold text-muted uppercase tracking-wider"
          >
            Branding
          </h2>
        </div>

        <div
          v-if="brandAdmin"
          class="p-5 space-y-6"
        >
          <div>
            <label
              for="brand-name"
              class="text-sm font-medium mb-1 block"
            >App name</label>
            <div class="flex flex-wrap gap-2">
              <UInput
                id="brand-name"
                v-model="nameDraft"
                placeholder="Taskmanager"
                :maxlength="BRAND_NAME_MAX_LENGTH"
                class="flex-1 min-w-[12rem]"
              />
              <UButton
                :loading="busy === 'brand'"
                @click="saveName"
              >
                Save name
              </UButton>
              <UButton
                color="neutral"
                variant="soft"
                :disabled="!brandAdmin.customName || busy === 'brand'"
                @click="nameDraft = ''; saveName()"
              >
                Reset name
              </UButton>
            </div>
            <p class="text-xs text-muted mt-1">
              Shown next to the logo and on the login page. Up to 40 characters. Leave it empty and save, or reset, for Taskmanager.
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-5">
            <div class="flex items-center justify-center size-20 rounded-lg border border-default bg-elevated/40 p-3">
              <img
                id="brand-logo-preview"
                :src="brand?.logoSrc ?? '/logo.svg'"
                alt="Current logo"
                class="max-h-full max-w-full"
              >
            </div>
            <div class="space-y-2">
              <p class="text-sm">
                {{ brandAdmin.customLogo ? 'An uploaded logo is in use.' : 'The logo that ships with Taskmanager is in use.' }}
              </p>
              <div class="flex flex-wrap gap-2">
                <label class="inline-flex">
                  <span class="sr-only">Upload a logo (SVG)</span>
                  <input
                    id="brand-logo-file"
                    type="file"
                    accept=".svg,image/svg+xml"
                    class="block text-sm file:mr-3 file:rounded-md file:border file:border-default file:bg-elevated file:px-3 file:py-1.5 file:text-sm file:text-default"
                    :disabled="busy === 'brand'"
                    @change="onLogoPicked"
                  >
                </label>
                <UButton
                  color="neutral"
                  variant="soft"
                  :disabled="!brandAdmin.customLogo || busy === 'brand'"
                  @click="saveLogo(null, 'Logo reset to the default')"
                >
                  Reset logo
                </UButton>
              </div>
              <p class="text-xs text-muted">
                An SVG of at most 100 KB. Scripts, links to other files and embedded pages are refused.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Links -->
      <section
        id="instance-links"
        class="rounded-xl border border-default bg-default overflow-hidden"
        aria-labelledby="links-heading"
      >
        <div class="px-5 py-3 border-b border-default bg-elevated/40 flex items-center gap-2">
          <UIcon
            name="i-lucide-link"
            class="size-4 text-primary"
          />
          <h2
            id="links-heading"
            class="text-xs font-semibold text-muted uppercase tracking-wider"
          >
            Links
          </h2>
        </div>
        <div class="p-5 grid gap-3 sm:grid-cols-3">
          <UButton
            color="neutral"
            variant="soft"
            icon="i-lucide-shield"
            block
            @click="accountsOpen = true"
          >
            Accounts on this instance
          </UButton>
          <UButton
            to="/admin/crews"
            color="neutral"
            variant="soft"
            icon="i-lucide-users"
            block
          >
            Crews
          </UButton>
          <UButton
            to="/help/admin/configuration"
            color="neutral"
            variant="soft"
            icon="i-lucide-book-open"
            block
          >
            Configuration help
          </UButton>
        </div>
        <div class="px-5 pb-5 text-xs text-muted">
          The server's own settings (its environment variables) are not changed here. The help page lists them.
        </div>
      </section>
    </div>

    <AdminUsersModal v-model:open="accountsOpen" />
  </div>
</template>
