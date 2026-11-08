import { inMaintenance } from '../utils/maintenance'

const RETRY_AFTER_SECONDS = 60

// The health check and the version stay up so a proxy, a deploy script or an agent can tell the app is running and which version it is.
const OPEN_PATHS = ['/api/health', '/api/version']

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="${RETRY_AFTER_SECONDS}"><title>Back soon</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#fafafa;color:#222}
main{max-width:28rem;padding:1.5rem;text-align:center}@media(prefers-color-scheme:dark){body{background:#111;color:#eee}}</style></head>
<body><main><h1>Back soon</h1><p>Taskmanager is being updated. This page checks again by itself.</p></main></body></html>`

// While maintenance is on every request is answered 503 with Retry-After: JSON for the
// API and the agent endpoint, a small page for the browser.
export default defineEventHandler((event) => {
  if (!inMaintenance()) return
  const path = event.path.split('?')[0] ?? ''
  if (OPEN_PATHS.includes(path)) return

  setResponseStatus(event, 503)
  setResponseHeader(event, 'Retry-After', RETRY_AFTER_SECONDS)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  if (path.startsWith('/api/')) {
    setResponseHeader(event, 'Content-Type', 'application/json')
    return { statusCode: 503, message: 'Taskmanager is being updated, try again in a minute' }
  }
  setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  return PAGE
})
