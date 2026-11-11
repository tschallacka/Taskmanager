// The instance's app name and logo (Instance settings). Public, so the login page gets the same branding as the app.
// The admin page changes it and calls refreshBrand() so the logo next to it follows at once. The shape and the
// defaults come from shared/utils/brand.ts, the same module the server uses.
import { DEFAULT_BRAND } from '../../shared/utils/brand'
import type { BrandPublic } from '../../shared/utils/brand'

export { DEFAULT_BRAND }
export type { BrandPublic }

export function useBrand() {
  return useFetch<BrandPublic>('/api/brand', { key: 'instance-brand', default: () => DEFAULT_BRAND })
}

export function refreshBrand() {
  return refreshNuxtData('instance-brand')
}
