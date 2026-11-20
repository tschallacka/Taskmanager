import { createAuthClient } from 'better-auth/vue'
import { createSessionCache } from '~/utils/sessionCache'
import { readSessionFromStore, type SessionAnswer, type SessionValue } from '~/utils/sessionRead'
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

// The session read for the app start (Speed, step E). It comes from the auth client's own store, which is the one place that
// asks the server for the session: a reload sends one get-session, and every reader shares its answer (utils/sessionCache.ts).
// After forgetSession() the store is asked again, and a read waits for its new answer, not the one the login page saw. If the
// new answer does not come in time, the read takes what the store has, so it never hangs.
const STALE_WAIT_MS = 3000
let staleAfter: unknown = null

type Session = NonNullable<Awaited<ReturnType<typeof authClient.getSession>>['data']>

// The store's answer once it is no longer pending. If it stays pending past STALE_WAIT_MS, the server answers instead
// (readSessionFromStore in utils/sessionRead.ts): a pending value is never returned.
function readStoreSession() {
  const state = authClient.useSession()
  const store = {
    value: () => state.value as unknown as SessionValue<Session>,
    onChange: (fn: () => void) => watch(() => state.value, () => fn())
  }
  return readSessionFromStore(
    store,
    () => authClient.getSession() as Promise<SessionAnswer<Session>>,
    staleAfter,
    STALE_WAIT_MS
  ).then((answer) => {
    staleAfter = null
    return answer as unknown as Awaited<ReturnType<typeof authClient.getSession>>
  })
}

const sessionCache = createSessionCache(readStoreSession)

export function readSession() {
  return sessionCache.get()
}

// Drops the cached session, and asks the store for a new answer (the login page calls it).
export function forgetSession() {
  sessionCache.forget()
  staleAfter = authClient.useSession().value
  authClient.$store.notify('$sessionSignal')
}

export { authClient }
