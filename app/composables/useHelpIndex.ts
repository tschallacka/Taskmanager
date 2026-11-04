// Which help pages the signed-in person may open, fetched once. A hint links to a page only when it is in
// here, so a hint never points at a page the person would be told does not exist.
const slugs = ref<Set<string> | null>(null)
let inflight: Promise<void> | null = null

export function useHelpIndex() {
  async function load() {
    if (slugs.value || inflight || !import.meta.client) return
    inflight = $fetch<{ docs: { slug: string }[] }>('/api/help')
      .then((answer) => {
        slugs.value = new Set(answer.docs.map(doc => doc.slug))
      })
      .catch(() => {
        // No help available: hints keep their text and drop the link.
        slugs.value = new Set()
      })
      .finally(() => {
        inflight = null
      })
    await inflight
  }

  return {
    load,
    has: (slug: string) => slugs.value?.has(slug) ?? false
  }
}
