import type { LegalPublished } from '#shared/utils/legalLinks'

// Whether each legal document is published, as the public API answers: a draft answers 404, so it is not published.
// Read once per browser, shared by every component that shows a legal link.
export function useLegalPublished() {
  const published = useState<LegalPublished>('legal-published', () => ({ privacy: false, imprint: false }))
  const asked = useState<boolean>('legal-published-asked', () => false)
  if (import.meta.client && !asked.value) {
    asked.value = true
    for (const name of ['privacy', 'imprint'] as const) {
      $fetch(`/api/legal/${name}`).then(
        () => { published.value = { ...published.value, [name]: true } },
        () => { /* a 404 (draft, or no document): not published */ }
      )
    }
  }
  return { published }
}
