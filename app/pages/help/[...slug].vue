<script setup lang="ts">
definePageMeta({ layout: 'app' })

// The help pages from docs/, cut to what the signed-in person may do: the server leaves out any page
// or section about something they could not do, so nothing here needs to hide anything itself.
interface HelpEntry { slug: string, title: string, summary: string, group: string, topics: string[] }
interface HelpHit { slug: string, title: string, summary: string, group: string, snippet: string | null }
interface HelpPage { slug: string, title: string, summary: string, body: string }

const route = useRoute()
const slug = computed(() => {
  const raw = route.params.slug
  return (Array.isArray(raw) ? raw.join('/') : String(raw ?? '')).replace(/^\/+|\/+$/g, '')
})

const { data: list } = useFetch<{ docs: HelpEntry[] }>('/api/help', { server: false, lazy: true })
const docs = computed(() => list.value?.docs ?? [])

const GROUP_LABELS: Record<string, string> = {
  '': 'Start here',
  'basics': 'Boards and tasks',
  'team': 'Teams and customers',
  'workspace': 'Your workspace and time',
  'crews': 'Crews',
  'agents': 'AI agents and Sprocket',
  'integrations': 'GitHub',
  'admin': 'Running the instance'
}
const groupLabel = (group: string) => GROUP_LABELS[group] ?? (group.charAt(0).toUpperCase() + group.slice(1).replace(/-/g, ' '))

const groups = computed(() => {
  const out: { group: string, label: string, entries: HelpEntry[] }[] = []
  for (const entry of docs.value) {
    let bucket = out.find(g => g.group === entry.group)
    if (!bucket) {
      bucket = { group: entry.group, label: groupLabel(entry.group), entries: [] }
      out.push(bucket)
    }
    bucket.entries.push(entry)
  }
  return out
})

// The page asked for. Without one the landing page lists everything the person may read.
const page = ref<HelpPage | null>(null)
const missing = ref(false)
const loadingPage = ref(false)

// /help itself opens the start page, when there is one for this person.
const shown = computed(() => slug.value || (docs.value.some(doc => doc.slug === 'index') ? 'index' : ''))

watch(shown, async (wanted) => {
  page.value = null
  missing.value = false
  if (!wanted) return
  loadingPage.value = true
  try {
    page.value = await $fetch<HelpPage>(`/api/help/${wanted.split('/').map(encodeURIComponent).join('/')}`)
    useSeoMeta({ title: `${page.value.title} · Help` })
  } catch {
    missing.value = true
  } finally {
    loadingPage.value = false
  }
}, { immediate: true })

useSeoMeta({ title: 'Help' })

// ─── Search ──────────────────────────────────────────────────

const query = ref('')
const hits = ref<HelpHit[] | null>(null)
let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(query, (text) => {
  if (searchTimer) clearTimeout(searchTimer)
  const wanted = text.trim()
  if (!wanted) {
    hits.value = null
    return
  }
  searchTimer = setTimeout(async () => {
    try {
      const answer = await $fetch<{ hits: HelpHit[] }>('/api/help', { query: { q: wanted } })
      // Only the newest question's answer counts.
      if (query.value.trim() === wanted) hits.value = answer.hits
    } catch {
      hits.value = []
    }
  }, 200)
})

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
})

// A link between help pages stays inside the app, with no reload.
function followLink(event: MouseEvent) {
  const anchor = (event.target as HTMLElement | null)?.closest('a')
  const href = anchor?.getAttribute('href')
  if (!anchor || !href || event.metaKey || event.ctrlKey || event.shiftKey) return
  if (href.startsWith('/')) {
    event.preventDefault()
    navigateTo(href)
  }
}

const crumb = computed(() => (page.value ? groupLabel(docs.value.find(d => d.slug === page.value!.slug)?.group ?? '') : ''))
</script>

<template>
  <div
    class="mx-auto flex w-full max-w-6xl gap-8 px-4 py-6 sm:px-6"
    data-help-page
  >
    <nav
      class="hidden w-60 shrink-0 space-y-4 lg:block"
      aria-label="Help pages"
    >
      <UInput
        v-model="query"
        icon="i-lucide-search"
        placeholder="Search the help…"
        size="sm"
        class="w-full"
        data-help-search
      />
      <div
        v-for="g in groups"
        :key="g.group"
        class="space-y-0.5"
      >
        <p class="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
          {{ g.label }}
        </p>
        <NuxtLink
          v-for="entry in g.entries"
          :key="entry.slug"
          :to="`/help/${entry.slug}`"
          class="block rounded-md px-2 py-1.5 text-sm text-muted transition-colors hover:bg-elevated hover:text-default"
          active-class="bg-elevated !text-default font-medium"
        >
          {{ entry.title }}
        </NuxtLink>
      </div>
    </nav>

    <main class="min-w-0 flex-1">
      <div class="mb-4 lg:hidden">
        <UInput
          v-model="query"
          icon="i-lucide-search"
          placeholder="Search the help…"
          size="sm"
          class="w-full"
        />
      </div>

      <section
        v-if="hits !== null"
        class="space-y-3"
        data-help-results
      >
        <h1 class="text-lg font-semibold text-default">
          {{ hits.length ? 'Pages that answer that' : 'Nothing found' }}
        </h1>
        <p
          v-if="!hits.length"
          class="text-sm text-muted"
        >
          No help page matches "{{ query }}". Try other words, or look through the list.
        </p>
        <NuxtLink
          v-for="hit in hits"
          :key="hit.slug"
          :to="`/help/${hit.slug}`"
          class="block rounded-lg border border-default p-3 transition-colors hover:bg-elevated/50"
          @click="query = ''"
        >
          <p class="text-sm font-medium text-default">
            {{ hit.title }}
          </p>
          <p class="mt-0.5 text-xs text-muted">
            {{ hit.snippet || hit.summary }}
          </p>
        </NuxtLink>
      </section>

      <article
        v-else-if="page"
        class="space-y-4"
        data-help-article
        @click="followLink"
      >
        <div>
          <p class="text-xs text-muted">
            {{ crumb }}
          </p>
          <h1 class="text-2xl font-semibold text-default">
            {{ page.title }}
          </h1>
          <p
            v-if="page.summary"
            class="mt-1 text-sm text-muted"
          >
            {{ page.summary }}
          </p>
        </div>
        <ChatMarkdown
          :text="page.body"
          class="help-body"
        />
      </article>

      <section
        v-else-if="missing"
        class="space-y-2"
        data-help-missing
      >
        <h1 class="text-lg font-semibold text-default">
          No such help page
        </h1>
        <p class="text-sm text-muted">
          It does not exist, or it is about something you cannot do here. Pick another from the list.
        </p>
      </section>

      <section
        v-else-if="!slug"
        class="space-y-6"
        data-help-landing
      >
        <div>
          <h1 class="text-2xl font-semibold text-default">
            Help
          </h1>
          <p class="mt-1 text-sm text-muted">
            How Taskmanager works, for what you can do here. You can also ask Sprocket, which reads the same pages.
          </p>
        </div>
        <div
          v-for="g in groups"
          :key="g.group"
          class="space-y-2"
        >
          <h2 class="text-sm font-semibold text-default">
            {{ g.label }}
          </h2>
          <div class="grid gap-2 sm:grid-cols-2">
            <NuxtLink
              v-for="entry in g.entries"
              :key="entry.slug"
              :to="`/help/${entry.slug}`"
              class="block rounded-lg border border-default p-3 transition-colors hover:bg-elevated/50"
            >
              <p class="text-sm font-medium text-default">
                {{ entry.title }}
              </p>
              <p class="mt-0.5 text-xs text-muted">
                {{ entry.summary }}
              </p>
            </NuxtLink>
          </div>
        </div>
        <p
          v-if="list && !docs.length"
          class="text-sm text-muted"
        >
          There are no help pages for you yet.
        </p>
      </section>
    </main>
  </div>
</template>
