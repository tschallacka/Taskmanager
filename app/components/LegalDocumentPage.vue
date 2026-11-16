<script setup lang="ts">
import { markdownToHtml, sanitizeHtml } from '~/utils/markdown'
import type { LegalDoc } from '#shared/utils/legalDocs'

// One legal document, public: its version and dates at the top, then the text. The page is in the look of the sign-in
// page. A document that is not published answers 404 from the API, and the page is then a 404 too.
const props = defineProps<{ name: 'privacy' | 'imprint' }>()

const { data: doc, error } = await useFetch<LegalDoc>(() => `/api/legal/${props.name}`, { server: false })
if (error.value) throw createError({ statusCode: 404, statusMessage: 'Not found' })

const dateLabel = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const html = computed(() => (doc.value ? sanitizeHtml(markdownToHtml(doc.value.body)) : ''))
useSeoMeta({ title: () => doc.value?.title ?? 'Legal' })
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-default px-4 py-10">
    <article
      v-if="doc"
      class="w-full max-w-2xl space-y-6 rounded-2xl border border-default bg-elevated p-8 shadow-xl"
    >
      <header class="space-y-2">
        <h1 class="text-xl font-semibold text-default">
          {{ doc.title }}
        </h1>
        <p class="text-sm text-muted">
          Version {{ doc.version }} · In force from {{ dateLabel(doc.effective) }} · Last changed {{ dateLabel(doc.changed) }}
        </p>
      </header>
      <!-- eslint-disable-next-line vue/no-v-html -- the text comes from our own legal/ files and is sanitised first -->
      <div
        class="prose prose-sm max-w-none text-default"
        v-html="html"
      />
    </article>
  </div>
</template>
