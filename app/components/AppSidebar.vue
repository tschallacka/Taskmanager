<script setup lang="ts">
const props = withDefaults(defineProps<{ collapsed?: boolean }>(), { collapsed: false })
const emit = defineEmits<{ 'close': [], 'toggle-rail': [] }>()
const searchOpen = useSearchModal()
const { session, signOut } = useAuth()
const colorMode = useColorMode()
const userInitials = computed(() => {
  const name = session.value?.user?.name
  if (!name) return '?'
  return name.split(' ').map((part: string) => part[0]).join('').slice(0, 2).toUpperCase()
})

const isDark = computed(() => colorMode.value === 'dark')

function toggleColorMode() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}

const accountItems = computed(() => [[
  {
    label: 'Settings',
    icon: 'i-lucide-settings',
    onSelect: () => navigateTo('/settings')
  },
  {
    label: 'Help',
    icon: 'i-lucide-life-buoy',
    onSelect: () => navigateTo('/help')
  },
  {
    label: isDark.value ? 'Light mode' : 'Dark mode',
    icon: isDark.value ? 'i-lucide-sun' : 'i-lucide-moon',
    onSelect: toggleColorMode
  }
], [
  {
    label: 'Sign out',
    icon: 'i-lucide-log-out',
    color: 'error' as const,
    onSelect: signOut
  }
]])

async function newProject() {
  navigateTo('/projects?new=1')
}

const route = useRoute()

// Closes the mobile sidebar drawer once navigation actually lands somewhere.
watch(() => route.path, () => emit('close'))
</script>

<template>
  <div
    class="flex h-full min-h-0 flex-col overflow-hidden bg-default"
    :data-rail="props.collapsed ? 'true' : undefined"
  >
    <!-- The rail: 64 px, icons only. Every control of the wide sidebar keeps its place here. -->
    <div
      v-if="props.collapsed"
      class="flex min-h-0 flex-1 flex-col items-center gap-2 py-3"
    >
      <UButton
        icon="i-lucide-panel-left-open"
        size="sm"
        color="neutral"
        variant="ghost"
        aria-label="Expand the sidebar"
        @click="emit('toggle-rail')"
      />
      <UButton
        icon="i-lucide-plus"
        size="sm"
        color="primary"
        aria-label="New"
        class="rounded-lg"
        @click="newProject()"
      />
      <UButton
        icon="i-lucide-search"
        size="sm"
        color="neutral"
        variant="ghost"
        aria-label="Search tasks and boards"
        @click="searchOpen = true"
      />
      <div class="mt-auto pb-1">
        <UAvatar
          :alt="userInitials"
          size="xs"
          class="shrink-0"
        />
      </div>
    </div>

    <template v-else>
      <div class="flex shrink-0 items-center gap-2 px-3 pb-3 pt-4">
        <AppLogo class="min-w-0 flex-1 text-xl" />
        <UButton
          icon="i-lucide-panel-left-close"
          size="sm"
          color="neutral"
          variant="ghost"
          aria-label="Collapse the sidebar to a rail"
          class="shrink-0"
          @click="emit('toggle-rail')"
        />
      </div>

      <div class="shrink-0 space-y-2 px-3 pb-2">
        <UButton
          block
          icon="i-lucide-plus"
          label="New"
          color="primary"
          aria-label="New"
          class="rounded-lg"
          @click="newProject()"
        />
        <button
          class="flex w-full items-center gap-2.5 rounded-lg border border-default bg-elevated/40 px-3 py-2 text-sm text-muted transition-colors hover:bg-elevated hover:text-default"
          @click="searchOpen = true"
        >
          <UIcon
            name="i-lucide-search"
            class="size-4 shrink-0"
          />
          <span class="min-w-0 flex-1 truncate text-left">Search</span>
          <UKbd
            value="meta"
            size="sm"
          />
          <UKbd
            value="K"
            size="sm"
          />
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-2">
        <ProjectsListPanel />
      </div>

      <div class="shrink-0 space-y-1.5 border-t border-default p-2">
        <TeamSwitcher />
        <UDropdownMenu
          :items="accountItems"
          :content="{ align: 'start', collisionPadding: 12 }"
          :ui="{ content: 'w-(--reka-dropdown-menu-trigger-width) min-w-48' }"
        >
          <button class="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-muted transition-colors hover:bg-elevated hover:text-default">
            <UAvatar
              :alt="userInitials"
              size="xs"
              class="shrink-0"
            />
            <span class="min-w-0 flex-1 truncate text-left text-xs">
              {{ session?.user?.name ?? session?.user?.email }}
            </span>
            <UIcon
              name="i-lucide-chevrons-up-down"
              class="size-3.5 shrink-0 opacity-50"
            />
          </button>
        </UDropdownMenu>
      </div>
    </template>
  </div>
</template>
