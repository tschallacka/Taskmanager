import { brandingOf } from '../../utils/instanceBranding'

// The instance's own icon, or the built-in one when none is set. Served for every size the browser asks for, and
// revalidated on each load, so a new icon shows at once.
export default defineEventHandler(async (event) => {
  const branding = await brandingOf()
  if (!branding.iconMime || !branding.iconData) return sendRedirect(event, '/favicon.ico', 302)
  setResponseHeader(event, 'Content-Type', branding.iconMime)
  setResponseHeader(event, 'Cache-Control', 'public, no-cache')
  return Buffer.from(branding.iconData, 'base64')
})
