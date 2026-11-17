<script setup lang="ts">
import { ACCOUNT_SECTIONS } from '~/utils/settingsSections'

// The settings shell (redesign 8/9): the title in the top bar, the left list of sections, and the section in the slot.
// Each account section is its own address, so the list is built from the section table; Sprocket and the AI history
// are pages of their own and keep their addresses.
const { isInstanceAdmin } = useAuth()

const icons: Record<string, string> = {
  'stats': 'i-lucide-chart-column',
  'account': 'i-lucide-user-round',
  'appearance': 'i-lucide-sun-moon',
  'api-keys': 'i-lucide-key-round',
  'ai': 'i-lucide-sparkles'
}

// A computed, so the list follows the session: an instance admin whose session loads after setup sees Crews and agents
// without a reload (the old v-if was reactive; a plain array was not).
const sections = computed(() => [
  ...ACCOUNT_SECTIONS.map(section => ({ label: section.label, icon: icons[section.key]!, to: section.path })),
  { label: 'Sprocket', icon: 'i-lucide-cog', to: '/settings/sprocket' },
  { label: 'AI history', icon: 'i-lucide-history', to: '/settings/ai-history' },
  // The admin's own pages are reached from here too, for an instance admin only.
  ...(isInstanceAdmin.value ? [{ label: 'Crews and agents', icon: 'i-lucide-bot', to: '/admin/crews' }] : [])
])
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
        <SectionNav :items="sections" />
      </nav>
      <div class="flex-1 min-w-0 overflow-y-auto">
        <UContainer class="py-6">
          <div class="flex flex-col gap-4">
            <slot />
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
