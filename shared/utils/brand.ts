// Instance branding: the one place the server and the app agree on the name, the logo limit and the shape of the public
// branding. Used by server/utils/brand.ts, app/composables/useBrand.ts and app/pages/admin/settings.vue.

export const DEFAULT_BRAND_NAME = 'Taskmanager'
/** The longest app name the admin may type. */
export const BRAND_NAME_MAX_LENGTH = 40
/** The largest uploaded logo, in bytes. A bigger file is refused, not stored. */
export const BRAND_LOGO_MAX_BYTES = 100_000

/** The public branding: what the login page and the sidebar show before and after sign-in. */
export interface BrandPublic {
  name: string
  /** A data: URL of the uploaded logo, or null for the logo that ships with the app. */
  logoSrc: string | null
}

export const DEFAULT_BRAND: BrandPublic = { name: DEFAULT_BRAND_NAME, logoSrc: null }
