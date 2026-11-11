// The instance's app name and logo (Instance settings). Public, so the login page gets the same branding as the app.
// The admin page changes it and calls refreshBrand() so the logo next to it follows at once.
export interface BrandPublic {
  name: string
  /** A data: URL of the uploaded logo, or null for the logo that ships with the app. */
  logoSrc: string | null
}

export const DEFAULT_BRAND: BrandPublic = { name: 'Taskmanager', logoSrc: null }

export function useBrand() {
  return useFetch<BrandPublic>('/api/brand', { key: 'instance-brand', default: () => DEFAULT_BRAND })
}

export function refreshBrand() {
  return refreshNuxtData('instance-brand')
}
