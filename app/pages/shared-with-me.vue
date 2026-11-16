<script setup lang="ts">
definePageMeta({ layout: 'app' })

useSeoMeta({ title: 'Shared with you' })

// The projects a customer contact can open, by customer. Nothing here can be created: this is what was shared.
type SharedGroup = { label: string, projects: { id: string, name: string }[] }
const { data, status } = await useFetch<{ groups: SharedGroup[] }>('/api/shared-with-me', { server: false, lazy: true })
const groups = computed(() => data.value?.groups ?? [])
</script>

<template>
  <div class="flex-1 min-w-0 flex flex-col overflow-hidden pb-14 lg:pb-0">
    <Teleport
      defer
      to="#app-topbar-title"
    >
      <h1 class="text-base font-semibold text-default">
        Shared with you
      </h1>
    </Teleport>

    <div class="flex-1 min-w-0 overflow-y-auto">
      <UContainer class="py-6">
        <div
          v-if="status === 'pending'"
          class="text-sm text-muted"
        >
          Loading…
        </div>

        <p
          v-else-if="!groups.length"
          class="text-sm text-muted"
        >
          Nothing is shared with you yet. Their projects show here as soon as they share one.
        </p>

        <div
          v-for="group in groups"
          :key="group.label"
          class="mb-6"
        >
          <h2 class="text-sm font-semibold text-default mb-2">
            {{ group.label === 'Shared with you' ? 'Shared with you' : `Shared with you by ${group.label}` }}
          </h2>
          <ul class="flex flex-col gap-1">
            <li
              v-for="project in group.projects"
              :key="project.id"
            >
              <NuxtLink
                :to="`/projects/${project.id}`"
                class="text-primary underline"
              >{{ project.name }}</NuxtLink>
            </li>
          </ul>
        </div>
      </UContainer>
    </div>
  </div>
</template>
