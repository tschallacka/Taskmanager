<script setup lang="ts">
const { sidebarOpen } = useSidebar()
// The sidebar is 240 px and collapses to a 64 px rail. The state is remembered in this browser (localStorage).
const RAIL_KEY = 'app-sidebar-rail'
const railCollapsed = ref(false)
onMounted(() => {
  try {
    railCollapsed.value = localStorage.getItem(RAIL_KEY) === '1'
  } catch { /* no storage here: the sidebar opens wide */ }
})
watch(railCollapsed, (value) => {
  try {
    localStorage.setItem(RAIL_KEY, value ? '1' : '0')
  } catch { /* no storage here: the choice lasts this visit */ }
})
</script>

<template>
  <UDashboardGroup
    unit="px"
    storage="local"
    storage-key="app-sidebar"
  >
    <UDashboardSidebar
      id="app-sidebar"
      v-model:open="sidebarOpen"
      v-model:collapsed="railCollapsed"
      collapsible
      :collapsed-size="64"
      :resizable="false"
      :default-size="240"
      :toggle="false"
      :ui="{
        root: 'bg-default',
        header: 'hidden',
        body: 'p-0 gap-0 overflow-hidden',
        footer: 'hidden',
        handle: 'hidden',
        content: 'max-w-[80vw]'
      }"
    >
      <template #default="{ collapsed }">
        <AppSidebar
          :collapsed="collapsed"
          @close="sidebarOpen = false"
          @toggle-rail="railCollapsed = !railCollapsed"
        />
      </template>
    </UDashboardSidebar>

    <div class="flex min-w-0 flex-1 overflow-hidden">
      <slot />
    </div>

    <SearchModal />
    <AiChatWidget />
  </UDashboardGroup>
</template>
