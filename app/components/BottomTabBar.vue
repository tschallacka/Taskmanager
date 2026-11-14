<script setup lang="ts">
// The phone's bottom tab bar (redesign 9/9). Shown below the lg breakpoint only; the drawer sidebar stays for the rest.
// Search opens the same modal as the sidebar's search button.
const route = useRoute()
const searchOpen = useSearchModal()
const { unread } = useNotifications()

const tabs = [
  { label: 'Home', icon: 'i-lucide-house', to: '/projects/home' },
  { label: 'Inbox', icon: 'i-lucide-inbox', to: '/projects/inbox', badge: true },
  { label: 'My tasks', icon: 'i-lucide-circle-check', to: '/projects/my-tasks' },
  { label: 'Projects', icon: 'i-lucide-folder', to: '/projects' },
  { label: 'Search', icon: 'i-lucide-search', to: null }
]

function isActive(to: string | null) {
  if (!to) return false
  return route.path === to || route.path.startsWith(`${to}/`)
}

// The floating New sits above the bar, as the sidebar's New does: it opens the new-project dialog.
function onNew() {
  navigateTo('/projects?new=1')
}
</script>

<template>
  <button
    type="button"
    data-testid="floating-new"
    aria-label="New"
    class="fixed right-4 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-inverted shadow-lg lg:hidden bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))]"
    @click="onNew"
  >
    <UIcon
      name="i-lucide-plus"
      class="size-6"
    />
  </button>

  <nav
    data-testid="bottom-tab-bar"
    aria-label="Main"
    class="fixed inset-x-0 bottom-0 z-40 flex border-t border-default bg-default px-2 pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom,0px))] lg:hidden"
  >
    <template
      v-for="tab in tabs"
      :key="tab.label"
    >
      <button
        v-if="!tab.to"
        type="button"
        class="relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 text-xs text-muted"
        @click="searchOpen = true"
      >
        <UIcon
          :name="tab.icon"
          class="size-6"
        />
        {{ tab.label }}
      </button>
      <NuxtLink
        v-else
        :to="tab.to"
        class="relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 text-xs"
        :class="isActive(tab.to) ? 'text-primary font-semibold' : 'text-muted'"
        :aria-current="isActive(tab.to) ? 'page' : undefined"
      >
        <UIcon
          :name="tab.icon"
          class="size-6"
        />
        {{ tab.label }}
        <span
          v-if="tab.badge && unread > 0"
          data-testid="inbox-count"
          class="absolute top-0 left-1/2 ml-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-inverted"
        >{{ unread }}</span>
      </NuxtLink>
    </template>
  </nav>
</template>
