// Which legal links the footer and the sign-up form may show. A link is shown only when its page answers: a draft's page
// is 404, so a link to it would lead nowhere. Pure; the components read the published state (app/composables/useLegalPublished.ts).

export interface LegalPublished {
  privacy: boolean
  imprint: boolean
}

export interface LegalLink {
  name: 'privacy' | 'imprint'
  label: string
  to: string
}

const ALL: LegalLink[] = [
  { name: 'privacy', label: 'Privacy', to: '/privacy' },
  { name: 'imprint', label: 'Imprint', to: '/imprint' }
]

/** The links to show, in order: only the published documents. */
export function legalLinksToShow(published: LegalPublished): LegalLink[] {
  return ALL.filter(link => published[link.name])
}

/** The sign-up consent names the Privacy Policy only while it is published: otherwise its link would be a 404. */
export function privacyConsentToShow(published: LegalPublished): boolean {
  return published.privacy
}
