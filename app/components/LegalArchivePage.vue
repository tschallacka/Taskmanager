<script setup lang="ts">
import type { ArchiveEntry } from '#shared/utils/legalArchive'

// Every version of one legal document that was in force, newest first. Each links to its own page; the version in
// force now links to the document itself. Public, like the document.
const props = defineProps<{ name: 'privacy' | 'imprint' }>()

const { data } = await useFetch<{ document: string, versions: ArchiveEntry[] }>(() => `/api/legal/${props.name}/archive`, { server: false })
const title = computed(() => (props.name === 'privacy' ? 'Privacy Policy' : 'Impressum / Legal notice'))
const dateLabel = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const linkFor = (entry: ArchiveEntry) => (entry.current ? `/${props.name}` : `/${props.name}/archive/${entry.version}`)
useSeoMeta({ title: () => `${title.value}: versions` })
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-default px-4 py-10">
    <article class="w-full max-w-2xl space-y-6 rounded-2xl border border-default bg-elevated p-8 shadow-xl">
      <header class="space-y-2">
        <h1 class="text-xl font-semibold text-default">
          {{ title }}: versions
        </h1>
        <p class="text-sm text-muted">
          Every version that was in force, newest first.
        </p>
      </header>
      <ul
        v-if="data"
        class="divide-y divide-default"
      >
        <li
          v-for="entry in data.versions"
          :key="entry.version"
          class="flex flex-wrap items-baseline justify-between gap-2 py-3"
        >
          <NuxtLink
            :to="linkFor(entry)"
            class="font-medium text-primary underline"
          >
            Version {{ entry.version }}
          </NuxtLink>
          <span class="text-sm text-muted">
            In force from {{ dateLabel(entry.effective) }}
            <template v-if="entry.replacedOn">
              · Replaced on {{ dateLabel(entry.replacedOn) }}
            </template>
            <template v-else>
              · In force now
            </template>
          </span>
        </li>
      </ul>
    </article>
  </div>
</template>
