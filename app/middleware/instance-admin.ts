import { authClient } from '~/composables/useAuth'

// Instance settings is the instance admin's page. Anyone else gets the same "page not found" as an address that does
// not exist, so the page is not even hinted at. A signed-out visitor never reaches here: the global middleware sends
// them to sign-in first.
export default defineNuxtRouteMiddleware(async () => {
  const sessionState = authClient.useSession()
  const session = (!sessionState.value.isPending && sessionState.value.data)
    ? sessionState.value.data
    : (await authClient.getSession()).data
  if (!session) return navigateTo('/login')
  if (!session.user?.isInstanceAdmin) {
    throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  }
})
