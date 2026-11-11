<script setup lang="ts">
const { sidebarOpen } = useSidebar()
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
      resizable
      :min-size="280"
      :default-size="360"
      :max-size="520"
      :toggle="false"
      :ui="{
        root: 'bg-default',
        header: 'hidden',
        body: 'p-0 gap-0 overflow-hidden',
        footer: 'hidden',
        handle: 'after:hover:bg-primary-500 after:transition-colors',
        content: 'max-w-[80vw]'
      }"
    >
      <AppSidebar @close="sidebarOpen = false" />
    </UDashboardSidebar>

    <!-- The page scrolls here: a page without a scroller of its own (the help pages, Instance settings at a short
         window) reaches its last line. Horizontal overflow stays clipped, as it was. -->
    <div class="flex min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
      <slot />
    </div>

    <SearchModal />
    <AiChatWidget />
  </UDashboardGroup>
</template>
