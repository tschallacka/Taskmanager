import { authClient } from '~/composables/useAuth'
import { isPublicPagePath } from '#shared/utils/publicPaths'

export default defineNuxtRouteMiddleware(async (to) => {
  // Sign-in, the public project pages, invitations, the mail confirmation, and the legal pages (privacy, imprint and
  // their archives) are readable without a session. The list is shared/utils/publicPaths.ts.
  if (isPublicPagePath(to.path)) return

  // The reactive session can still be empty right after signing in, so an
  // absent session is confirmed against the server before bouncing to /login.
  const sessionState = authClient.useSession()
  const session = (!sessionState.value.isPending && sessionState.value.data)
    ? sessionState.value.data
    : (await authClient.getSession()).data
  if (!session) return navigateTo('/login')
})
