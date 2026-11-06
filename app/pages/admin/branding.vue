<script setup lang="ts">
definePageMeta({ layout: 'app' })

useSeoMeta({ title: 'Branding' })

// The name and icon the instance shows. Only the instance admin sees and changes them; the server checks too.
const { isInstanceAdmin, isPending: sessionPending } = useAuth()
const toast = useToast()
const { sidebarOpen } = useSidebar()

interface BrandingAdmin {
  name: string
  defaultName: string
  maxNameLength: number
  hasIcon: boolean
  iconMime: string | null
}

const { data, refresh } = useFetch<BrandingAdmin>('/api/admin/branding', { server: false, immediate: false })

const name = ref('')
const saving = ref(false)
// A new icon, read from the file the admin picked: its type, its data (base64) and a preview.
const pickedIcon = ref<{ mime: string, data: string, preview: string } | null>(null)

watch([sessionPending, isInstanceAdmin], ([pending, admin]) => {
  if (pending) return
  if (!admin) {
    navigateTo('/settings', { replace: true })
    return
  }
  refresh()
}, { immediate: true })

watch(data, (loaded) => {
  if (loaded) name.value = loaded.name
}, { immediate: true })

const previewSrc = computed(() => pickedIcon.value?.preview ?? (data.value?.hasIcon ? '/api/branding/icon' : '/favicon.ico'))

function errMsg(e: unknown): string | undefined {
  return (e as { data?: { message?: string } })?.data?.message
}

// Read on the client, so the server gets the bytes once; the server checks the picture again.
function pickIcon(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (!['image/png', 'image/svg+xml'].includes(file.type)) {
    toast.add({ title: 'The icon must be a PNG or an SVG', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  if (file.size > 512 * 1024) {
    toast.add({ title: 'The icon can be at most 512 KB', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    const url = String(reader.result)
    pickedIcon.value = { mime: file.type, data: url.slice(url.indexOf(',') + 1), preview: url }
  }
  reader.readAsDataURL(file)
}

async function save() {
  if (saving.value) return
  saving.value = true
  try {
    const body: { name: string, icon?: { mime: string, data: string } } = { name: name.value }
    if (pickedIcon.value) body.icon = { mime: pickedIcon.value.mime, data: pickedIcon.value.data }
    await $fetch('/api/admin/branding', { method: 'PUT', body })
    pickedIcon.value = null
    toast.add({ title: 'Saved', description: 'Tabs and the sidebar show it on the next load.', icon: 'i-lucide-check', duration: 2500 })
    await refresh()
    await refreshNuxtData('instance-branding')
  } catch (e) {
    toast.add({ title: errMsg(e) || 'Could not save', icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function resetAll() {
  if (saving.value) return
  saving.value = true
  try {
    await $fetch('/api/admin/branding', { method: 'PUT', body: { reset: true } })
    pickedIcon.value = null
    toast.add({ title: 'Back to the built-in name and icon', icon: 'i-lucide-check', duration: 2500 })
    await refresh()
    await refreshNuxtData('instance-branding')
  } catch (e) {
    toast.add({ title: errMsg(e) || 'Could not reset', icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto px-4 pb-10 pt-6 lg:px-6">
    <div class="mx-auto max-w-3xl space-y-8">
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
            Branding
          </h1>
          <p class="text-sm text-muted">
            The name and the icon of this instance. Only the instance admin sees this page.
          </p>
        </div>
      </div>

      <section class="space-y-4 rounded-xl border border-default p-5">
        <UFormField
          label="Name"
          :hint="`At most ${data?.maxNameLength ?? 40} characters. Default: ${data?.defaultName ?? 'Taskmanager'}`"
        >
          <UInput
            v-model="name"
            :maxlength="data?.maxNameLength ?? 40"
            class="w-full"
            data-branding-name
          />
        </UFormField>

        <div class="space-y-2">
          <p class="text-sm font-medium text-default">
            Icon
          </p>
          <p class="text-xs text-muted">
            A square PNG of at least 512 by 512 pixels, or an SVG without scripts. The browser scales it to the sizes it shows.
          </p>
          <div class="flex flex-wrap items-center gap-4">
            <img
              :src="previewSrc"
              alt=""
              class="size-16 rounded-lg border border-default bg-elevated object-contain p-1"
              data-branding-preview
            >
            <input
              type="file"
              accept="image/png,image/svg+xml"
              class="text-sm"
              data-branding-icon
              @change="pickIcon"
            >
          </div>
        </div>

        <div class="space-y-2 rounded-lg border border-default p-3">
          <p class="text-xs font-medium text-muted">
            Browser tab
          </p>
          <div class="flex items-center gap-2 text-sm">
            <img
              :src="previewSrc"
              alt=""
              class="size-4 object-contain"
            >
            <span class="truncate">{{ name || data?.defaultName || 'Taskmanager' }}</span>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-end gap-2">
          <UButton
            color="neutral"
            variant="soft"
            icon="i-lucide-rotate-ccw"
            :disabled="saving"
            data-branding-reset
            @click="resetAll"
          >
            Reset to default
          </UButton>
          <UButton
            icon="i-lucide-save"
            :loading="saving"
            data-branding-save
            @click="save"
          >
            Save
          </UButton>
        </div>
      </section>
    </div>
  </div>
</template>
