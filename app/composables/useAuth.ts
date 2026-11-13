import { createAuthClient } from 'better-auth/vue'
import { emailOTPClient, genericOAuthClient, inferAdditionalFields, organizationClient, twoFactorClient } from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'

const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
  plugins: [
    organizationClient(),
    twoFactorClient(),
    passkeyClient(),
    emailOTPClient(),
    genericOAuthClient(),
    // Mirrors user.additionalFields in server/lib/auth.ts, so the session is typed with them.
    inferAdditionalFields({
      user: {
        isInstanceAdmin: { type: 'boolean', input: false },
        canCreateOrganizations: { type: 'boolean', input: false }
      }
    })
  ]
})

export function useAuth() {
  const sessionRef = authClient.useSession()

  const session = computed(() => sessionRef.value.data)
  const isPending = computed(() => sessionRef.value.isPending)
  const isInstanceAdmin = computed(() => Boolean(session.value?.user?.isInstanceAdmin))
  const canCreateOrganizations = computed(() => Boolean(session.value?.user?.canCreateOrganizations))

  // Each provider comes back to `callbackURL`, which is an invitation page when
  // the sign-in started from one.
  async function signInWithDiscord(callbackURL = '/projects') {
    await authClient.signIn.social({ provider: 'discord', callbackURL })
  }

  async function signInWithGitHub(callbackURL = '/projects') {
    await authClient.signIn.social({ provider: 'github', callbackURL })
  }

  async function signInWithGoogle(callbackURL = '/projects') {
    await authClient.signIn.social({ provider: 'google', callbackURL })
  }

  async function signInWithOidc(callbackURL = '/projects') {
    await authClient.signIn.oauth2({ providerId: 'oidc', callbackURL })
  }

  async function signOut() {
    await authClient.signOut()
    window.location.href = '/login'
  }

  // Re-reads the session after a change to the person's own name or picture, so the shown values update at once.
  function refreshSession() {
    authClient.$store.notify('$sessionSignal')
  }

  return {
    session,
    refreshSession,
    isPending,
    isInstanceAdmin,
    canCreateOrganizations,
    signInWithDiscord,
    signInWithGitHub,
    signInWithGoogle,
    signInWithOidc,
    signOut
  }
}

export { authClient }
