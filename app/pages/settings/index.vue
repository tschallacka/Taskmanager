<script setup lang="ts">
import { AI_SETTINGS_KEY, useAiSettings } from '~/composables/useAiSettings'

definePageMeta({ layout: 'app' })

useSeoMeta({ title: 'Settings' })

const { isInstanceAdmin } = useAuth()

// One set of AI refs for the page: the stats and the AI section both read it, so the models are fetched once.
provide(AI_SETTINGS_KEY, useAiSettings())

// The settings section list: each entry jumps to a section on this page (or to a settings page).
// A jump to a section of this page scrolls the page's own scroll box to it: a plain #hash does not scroll
// a box that is not the document, so the phone list and the wide list both use this.
function jumpTo(to: string) {
  if (!to.startsWith('#')) return
  document.getElementById(to.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const sections = [
  { label: 'Your stats', icon: 'i-lucide-chart-column', to: '#stats' },
  { label: 'Account', icon: 'i-lucide-user-round', to: '#account' },
  { label: 'Appearance', icon: 'i-lucide-sun-moon', to: '#appearance' },
  { label: 'API keys and MCP', icon: 'i-lucide-key-round', to: '#api-keys' },
  { label: 'AI', icon: 'i-lucide-sparkles', to: '#ai' },
  { label: 'Sprocket', icon: 'i-lucide-cog', to: '/settings/sprocket' },
  { label: 'AI history', icon: 'i-lucide-history', to: '/settings/ai-history' }
]
</script>

<template>
  <!-- Main content -->
  <div class="flex-1 min-w-0 flex flex-col overflow-hidden pb-14 lg:pb-0">
    <!-- The page title and its links go into the shared top bar. -->
    <Teleport
      defer
      to="#app-topbar-title"
    >
      <h1 class="text-base font-semibold text-default">
        Settings
      </h1>
    </Teleport>

    <div class="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <!-- The section list: a row of jumps on a phone, a column on the left on a wide screen. -->
      <nav
        aria-label="Settings sections"
        class="flex shrink-0 gap-1 overflow-x-auto border-b border-default p-2 lg:w-52 lg:flex-col lg:gap-0.5 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-3"
      >
        <UButton
          v-for="s in sections"
          :key="s.to"
          :to="s.to.startsWith('#') ? undefined : s.to"
          :label="s.label"
          :icon="s.icon"
          color="neutral"
          variant="ghost"
          size="sm"
          class="shrink-0 justify-start"
          @click="jumpTo(s.to)"
        />
        <UButton
          v-if="isInstanceAdmin"
          to="/admin/crews"
          label="Crews and agents"
          icon="i-lucide-bot"
          color="neutral"
          variant="ghost"
          size="sm"
          block
          class="justify-start"
        />
      </nav>
      <div class="flex-1 min-w-0 overflow-y-auto">
        <UContainer class="py-6">
          <div class="flex flex-col gap-4">
            <!-- Each section is its own component (app/components/settings/); the order is the list's order. -->
            <SettingsStats />

            <SettingsAccount />

            <!-- Passkeys and two-factor -->
            <SecurityPanel />

            <!-- Who may see this address -->
            <EmailPrivacyPanel />

            <SettingsAppearance />

            <SettingsApiKeys />

            <SettingsAi />
          </div>
        </UContainer>
      </div>
    </div>
  </div>

  <!-- Mobile bottom nav -->
  <div
    class="fixed bottom-0 left-0 right-0 z-20 lg:hidden flex items-center justify-around px-8 border-t border-default bg-default/95 backdrop-blur-sm"
    style="padding-top: 0.5rem; padding-bottom: max(0.5rem, env(safe-area-inset-bottom))"
  >
    <UButton
      icon="i-lucide-arrow-left"
      label="Boards"
      color="neutral"
      variant="ghost"
      size="md"
      @click="navigateTo('/projects')"
    />
  </div>
</template>
