<script setup lang="ts">
// The instance's own name, as the instance admin set it (Branding). The built-in name until it loads.
const { data: branding } = useFetch<{ name: string }>('/api/branding', { key: 'instance-branding', server: false })
const instanceName = computed(() => branding.value?.name || 'Taskmanager')
definePageMeta({ middleware: [] }) // skip auth middleware on this page

useSeoMeta({ title: 'Sign in' })

const config = useRuntimeConfig()
const { signInWithDiscord, signInWithGitHub, signInWithGoogle, signInWithOidc } = useAuth()
const isDiscordEnabled = computed(() => String(config.public.discordEnabled) === 'true')
const isGitHubEnabled = computed(() => String(config.public.githubEnabled) === 'true')
const isGoogleEnabled = computed(() => String(config.public.googleEnabled) === 'true')
const isOidcEnabled = computed(() => String(config.public.oidcEnabled) === 'true')
const isEmailCodeEnabled = computed(() => String(config.public.emailCodeEnabled) === 'true')
const isPasskeysEnabled = computed(() => String(config.public.passkeysEnabled) === 'true')
// An invitation link sends people here with its token. It opens sign-up even where
// sign-up is closed (the server checks the invitation cookie, not this flag), and
// every way of signing in returns to the invitation to accept it.
const route = useRoute()
const inviteToken = computed(() => {
  const value = route.query.invite
  return typeof value === 'string' && /^[\w-]+$/.test(value) ? value : ''
})
const returnTo = computed(() => inviteToken.value ? `/invite/${inviteToken.value}` : '/projects')
const isSignUpAllowed = computed(() => String(config.public.allowSignUp) === 'true' || Boolean(inviteToken.value))
const oidcName = computed(() => String(config.public.oidcName || 'Single sign-on'))
const hasAlternatives = computed(() => isDiscordEnabled.value || isGitHubEnabled.value || isGoogleEnabled.value
  || isOidcEnabled.value || isEmailCodeEnabled.value || isPasskeysEnabled.value)

// `credentials` is the password form; the other two replace it in the same card.
const step = ref<'credentials' | 'email-code' | 'two-factor'>('credentials')
// An invitation page sends someone without an account straight to sign-up (`signup=1`).
const mode = ref<'sign-in' | 'sign-up'>(inviteToken.value && route.query.signup === '1' ? 'sign-up' : 'sign-in')
const name = ref('')
const email = ref('')
const password = ref('')
const code = ref('')
const codeSent = ref(false)
const useBackupCode = ref(false)
const trustDevice = ref(false)
const error = ref('')
const isPending = ref(false)

// A full page load, not a client-side one: the projects store and user
// settings are seeded by plugins that only run once, and they need the fresh
// session.
async function finish() {
  await navigateTo(returnTo.value, { external: true })
}

async function run(action: () => Promise<{ error: { message?: string } | null }>, onSuccess: () => unknown = finish) {
  error.value = ''
  isPending.value = true
  try {
    const result = await action()
    if (result.error) {
      error.value = result.error.message || 'Authentication failed'
      return
    }
    await onSuccess()
  } finally {
    isPending.value = false
  }
}

async function submit() {
  if (mode.value === 'sign-up') {
    await run(() => authClient.signUp.email({ name: name.value, email: email.value, password: password.value }))
    return
  }

  error.value = ''
  isPending.value = true
  const result = await authClient.signIn.email({ email: email.value, password: password.value })
  isPending.value = false
  if (result.error) {
    error.value = result.error.message || 'Authentication failed'
    return
  }
  // The password was right, but the account wants an authenticator code as well.
  if ((result.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
    show('two-factor')
    return
  }
  await finish()
}

async function sendEmailCode() {
  await run(
    () => authClient.emailOtp.sendVerificationOtp({ email: email.value, type: 'sign-in' }),
    () => {
      codeSent.value = true
      code.value = ''
    }
  )
}

async function verifyEmailCode() {
  await run(() => authClient.signIn.emailOtp({ email: email.value, otp: code.value.trim() }))
}

async function verifyTwoFactor() {
  const value = code.value.trim()
  await run(() => useBackupCode.value
    ? authClient.twoFactor.verifyBackupCode({ code: value, trustDevice: trustDevice.value })
    : authClient.twoFactor.verifyTotp({ code: value, trustDevice: trustDevice.value }))
}

async function signInWithPasskey() {
  await run(() => authClient.signIn.passkey())
}

function show(next: typeof step.value) {
  step.value = next
  code.value = ''
  codeSent.value = false
  useBackupCode.value = false
  error.value = ''
}

function switchMode() {
  mode.value = mode.value === 'sign-in' ? 'sign-up' : 'sign-in'
  error.value = ''
}

// Offers saved passkeys in the email field's autofill list, where browsers support
// it. The request stays open in the background until one is picked, so a failure
// here is someone choosing another way in — not something to show as an error.
onMounted(async () => {
  if (!isPasskeysEnabled.value || !window.PublicKeyCredential?.isConditionalMediationAvailable) return
  if (!await window.PublicKeyCredential.isConditionalMediationAvailable()) return
  const result = await authClient.signIn.passkey({ autoFill: true })
  if (!result?.error) await finish()
})
</script>

<template>
  <div class="flex items-center justify-center min-h-screen bg-zinc-950">
    <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-full max-w-sm space-y-6 shadow-xl">
      <div class="text-center space-y-2">
        <AppLogo class="text-2xl mx-auto block" />
        <h1 class="text-xl font-semibold text-white">
          <template v-if="step === 'two-factor'">
            Two-factor authentication
          </template>
          <template v-else-if="step === 'email-code'">
            Sign in with an email code
          </template>
          <template v-else>
            {{ mode === 'sign-in' ? `Sign in to ${instanceName}` : 'Create your account' }}
          </template>
        </h1>
        <p class="text-sm text-zinc-400">
          <template v-if="step === 'two-factor'">
            {{ useBackupCode ? 'Enter one of your backup codes.' : 'Enter the code from your authenticator app.' }}
          </template>
          <template v-else-if="step === 'email-code'">
            {{ codeSent ? `We sent a code to ${email}.` : 'We will email you a one-time code.' }}
          </template>
          <template v-else-if="inviteToken">
            Sign in or create an account to accept your invitation. Use the email address it was sent to, or a
            sign-in provider that reports that address.
          </template>
          <template v-else>
            Your projects and tasks stay on this server.
          </template>
        </p>
      </div>

      <!-- Password -->
      <form
        v-if="step === 'credentials'"
        class="space-y-4"
        @submit.prevent="submit"
      >
        <UFormField
          v-if="mode === 'sign-up'"
          label="Name"
          required
        >
          <UInput
            v-model="name"
            autocomplete="name"
            class="w-full"
            required
          />
        </UFormField>
        <UFormField
          label="Email"
          required
        >
          <UInput
            v-model="email"
            type="email"
            :autocomplete="mode === 'sign-in' && isPasskeysEnabled ? 'username webauthn' : 'email'"
            class="w-full"
            required
          />
        </UFormField>
        <UFormField
          label="Password"
          hint="At least 8 characters"
          required
        >
          <UInput
            v-model="password"
            type="password"
            :autocomplete="mode === 'sign-up' ? 'new-password' : 'current-password'"
            minlength="8"
            class="w-full"
            required
          />
        </UFormField>

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          :description="error"
        />

        <UButton
          block
          type="submit"
          size="lg"
          color="primary"
          :loading="isPending"
        >
          {{ mode === 'sign-in' ? 'Sign in' : 'Create account' }}
        </UButton>
      </form>

      <!-- Email code -->
      <form
        v-else-if="step === 'email-code'"
        class="space-y-4"
        @submit.prevent="codeSent ? verifyEmailCode() : sendEmailCode()"
      >
        <UFormField
          v-if="!codeSent"
          label="Email"
          required
        >
          <UInput
            v-model="email"
            type="email"
            autocomplete="email"
            class="w-full"
            required
          />
        </UFormField>
        <UFormField
          v-else
          label="Code"
          required
        >
          <UInput
            v-model="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            class="w-full"
            required
          />
        </UFormField>

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          :description="error"
        />

        <UButton
          block
          type="submit"
          size="lg"
          color="primary"
          :loading="isPending"
        >
          {{ codeSent ? 'Sign in' : 'Send code' }}
        </UButton>
        <div class="flex justify-between text-sm">
          <button
            type="button"
            class="text-zinc-400 hover:text-zinc-200"
            @click="show('credentials')"
          >
            Back
          </button>
          <button
            v-if="codeSent"
            type="button"
            class="text-emerald-400 hover:text-emerald-300"
            :disabled="isPending"
            @click="sendEmailCode"
          >
            Send a new code
          </button>
        </div>
      </form>

      <!-- Two-factor -->
      <form
        v-else
        class="space-y-4"
        @submit.prevent="verifyTwoFactor"
      >
        <UFormField
          :label="useBackupCode ? 'Backup code' : 'Code'"
          required
        >
          <UInput
            v-model="code"
            :inputmode="useBackupCode ? 'text' : 'numeric'"
            autocomplete="one-time-code"
            class="w-full"
            required
          />
        </UFormField>
        <UCheckbox
          v-model="trustDevice"
          label="Trust this device for 30 days"
        />

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          :description="error"
        />

        <UButton
          block
          type="submit"
          size="lg"
          color="primary"
          :loading="isPending"
        >
          Verify
        </UButton>
        <div class="flex justify-between text-sm">
          <button
            type="button"
            class="text-zinc-400 hover:text-zinc-200"
            @click="show('credentials')"
          >
            Back
          </button>
          <button
            type="button"
            class="text-emerald-400 hover:text-emerald-300"
            @click="useBackupCode = !useBackupCode; code = ''; error = ''"
          >
            {{ useBackupCode ? 'Use authenticator code' : 'Use a backup code' }}
          </button>
        </div>
      </form>

      <template v-if="step === 'credentials'">
        <div
          v-if="isSignUpAllowed"
          class="text-center text-sm text-zinc-400"
        >
          {{ mode === 'sign-in' ? 'New here?' : 'Already have an account?' }}
          <button
            type="button"
            class="text-emerald-400 hover:text-emerald-300"
            @click="switchMode"
          >
            {{ mode === 'sign-in' ? 'Create an account' : 'Sign in' }}
          </button>
        </div>

        <template v-if="hasAlternatives">
          <div class="flex items-center gap-3 text-xs text-zinc-600">
            <div class="h-px flex-1 bg-zinc-800" />
            or
            <div class="h-px flex-1 bg-zinc-800" />
          </div>
          <div class="space-y-3">
            <UButton
              v-if="isPasskeysEnabled"
              block
              size="lg"
              color="neutral"
              variant="outline"
              class="gap-2"
              :disabled="isPending"
              @click="signInWithPasskey"
            >
              <UIcon
                name="i-lucide-fingerprint"
                class="size-5"
              />
              Sign in with a passkey
            </UButton>
            <UButton
              v-if="isEmailCodeEnabled"
              block
              size="lg"
              color="neutral"
              variant="outline"
              class="gap-2"
              @click="show('email-code')"
            >
              <UIcon
                name="i-lucide-mail"
                class="size-5"
              />
              Email me a code
            </UButton>
            <UButton
              v-if="isOidcEnabled"
              block
              size="lg"
              color="neutral"
              variant="outline"
              class="gap-2"
              @click="signInWithOidc(returnTo)"
            >
              <UIcon
                name="i-lucide-key-round"
                class="size-5"
              />
              Continue with {{ oidcName }}
            </UButton>
            <UButton
              v-if="isDiscordEnabled"
              block
              size="lg"
              color="neutral"
              variant="outline"
              class="gap-2"
              @click="signInWithDiscord(returnTo)"
            >
              <UIcon
                name="i-simple-icons-discord"
                class="size-5"
              />
              Continue with Discord
            </UButton>
            <UButton
              v-if="isGitHubEnabled"
              block
              size="lg"
              color="neutral"
              variant="outline"
              class="gap-2"
              @click="signInWithGitHub(returnTo)"
            >
              <UIcon
                name="i-simple-icons-github"
                class="size-5"
              />
              Continue with GitHub
            </UButton>
            <UButton
              v-if="isGoogleEnabled"
              block
              size="lg"
              color="neutral"
              variant="outline"
              class="gap-2"
              @click="signInWithGoogle(returnTo)"
            >
              <UIcon
                name="i-simple-icons-google"
                class="size-5"
              />
              Continue with Google
            </UButton>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>
