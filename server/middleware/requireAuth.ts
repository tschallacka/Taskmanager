import { auth } from '../lib/auth'
import { crewAccountLive, isCrewAddress } from '../utils/crewAccounts'
import { isProtectedApiPath } from '../utils/protectedApi'
import { serverTimingHeader } from '../utils/serverTiming'

// The routes that take an API key as well as a session: POST /api/projects/:id/import, POST /api/projects/import
// and GET /api/projects/:id/backup. Each one authenticates the key and applies its own permission rule.
const BOARD_IMPORT_PATH = /^\/api\/projects(\/[^/]+\/(import|backup)|\/import)$/

// GitHub calls this itself, so it carries no session. It proves who it is with the
// X-Hub-Signature-256 header, checked in the route.
const WEBHOOK_PATHS = ['/api/github/webhook']

export default defineEventHandler(async (event) => {
  const path = event.path
  if (WEBHOOK_PATHS.includes(path)) return
  // A board import may come with an API key: the route authenticates the key and applies the admin rule itself.
  if (BOARD_IMPORT_PATH.test(path.split('?')[0]!) && /^Bearer\s/i.test(event.headers.get('authorization') ?? '')) return
  // Everything on the protected list needs a session (see utils/protectedApi). `/api/invitations` is not on it:
  // an invite link has to be readable before its recipient has an account.
  if (!isProtectedApiPath(path)) return

  // The time of the auth stages, sent as Server-Timing so a browser shows where a request's time went (Speed, card mwibpggp).
  const started = performance.now()
  const session = await auth.api.getSession({ headers: event.headers })
  const sessionMs = performance.now() - started
  if (!session) throw createError({ statusCode: 401, message: 'Unauthorized' })

  // A crew account is refused once its crew is disabled or gone, even on a session that
  // was open before that happened.
  let crewMs: number | undefined
  if (isCrewAddress(session.user.email)) {
    const crewStarted = performance.now()
    const live = await crewAccountLive(session.user.id)
    crewMs = performance.now() - crewStarted
    if (!live) throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
  setResponseHeader(event, 'Server-Timing', serverTimingHeader({ session: sessionMs, crew: crewMs }))
  event.context.session = session
})
