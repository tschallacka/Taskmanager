import { brandingOf } from '../../utils/instanceBranding'

// The web app manifest, so an installed app takes the instance's name and icon. The built-in icons are the files
// in public/ until the instance sets its own.
const BUILT_IN_ICONS = [
  { src: '/pwa-64x64.png', sizes: '64x64', type: 'image/png', purpose: 'any' },
  { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
]

export default defineEventHandler(async (event) => {
  const branding = await brandingOf()
  const icons = branding.iconMime && branding.iconData
    ? [
        { src: '/api/branding/icon', sizes: '512x512', type: branding.iconMime, purpose: 'any' },
        { src: '/api/branding/icon', sizes: '512x512', type: branding.iconMime, purpose: 'maskable' }
      ]
    : BUILT_IN_ICONS
  setResponseHeader(event, 'Content-Type', 'application/manifest+json')
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  return {
    name: branding.name,
    short_name: branding.name.slice(0, 12),
    description: 'Self-hosted projects, tasks and notes',
    theme_color: '#18181b',
    background_color: '#18181b',
    display: 'standalone',
    orientation: 'portrait',
    scope: '/',
    start_url: '/',
    icons
  }
})
