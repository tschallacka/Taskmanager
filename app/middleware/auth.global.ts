import { authClient, forgetSession, readSession } from '~/composables/useAuth'
import { isPublicPagePath } from '#shared/utils/publicPaths'

export default defineNuxtRouteMiddleware(async (to) => {
  // A sign-in starts on the login page: the next read of the session must ask the server.
  if (to.path === '/login') {
    forgetSession()
    return
  }
  // The pages a signed-out visitor may open: the public project pages, invitations, the mail confirmation, and the
  // legal pages (privacy, imprint and their archives). The list is shared/utils/publicPaths.ts.
  if (isPublicPagePath(to.path)) return

  // The reactive session can still be empty right after signing in, so an
  // absent session is confirmed against the server before bouncing to /login.
  const sessionState = authClient.useSession()
  const session = (!sessionState.value.isPending && sessionState.value.data)
    ? sessionState.value.data
    : (await readSession()).data
  if (!session) return navigateTo('/login')
})
