import { brandingOf } from '../utils/instanceBranding'

// The instance's name and whether it has its own icon: what the login page and the tab need before anyone signs in.
export default defineEventHandler(async (event) => {
  const branding = await brandingOf()
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  return { name: branding.name, hasIcon: branding.iconData !== null }
})
