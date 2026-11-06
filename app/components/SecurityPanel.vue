<script setup lang="ts">
import { format } from 'date-fns'
import { renderSVG } from 'uqr'

interface PasskeySummary {
  id: string
  name?: string | null
  deviceType: string
  backedUp: boolean
  createdAt?: Date | string | null
}

const config = useRuntimeConfig()
const { session } = useAuth()
const toast = useToast()

const isPasskeysEnabled = computed(() => String(config.public.passkeysEnabled) === 'true')

let failures = 0
function failed(title: string, message?: string) {
  failures++
  toast.add({ title, description: message, icon: 'i-lucide-alert-triangle', color: 'error' })
}

// ─── Passkeys ───────────────────────────────────────────────
const passkeys = ref<PasskeySummary[]>([])
const passkeysLoading = ref(true)
const newPasskeyName = ref('')
const addingPasskey = ref(false)
const deletingPasskey = ref<string | null>(null)

async function loadPasskeys() {
  if (!isPasskeysEnabled.value) return
  passkeysLoading.value = true
  const { data, error } = await authClient.passkey.listUserPasskeys()
  // An empty list and a failed request look the same unless the failure is said out loud.
  if (error) failed('Could not load your passkeys', error.message)
  passkeys.value = (data ?? []) as PasskeySummary[]
  passkeysLoading.value = false
}

async function addPasskey() {
  addingPasskey.value = true
  try {
    const result = await authClient.passkey.addPasskey({ name: newPasskeyName.value.trim() || undefined })
    if (result?.error) {
      // Closing the browser's own passkey dialog is a choice, not a failure.
      if (!('code' in result.error) || result.error.code !== 'ERROR_CEREMONY_ABORTED') failed('Could not add the passkey', result.error.message)
      return
    }
    newPasskeyName.value = ''
    toast.add({ title: 'Passkey added', icon: 'i-lucide-check', duration: 2000 })
    await loadPasskeys()
  } finally {
    addingPasskey.value = false
  }
}

async function deletePasskey(key: PasskeySummary) {
  deletingPasskey.value = key.id
  try {
    const { error } = await authClient.passkey.deletePasskey({ id: key.id })
    if (error) return failed('Could not remove the passkey', error.message)
    toast.add({ title: 'Passkey removed', icon: 'i-lucide-trash', duration: 2000 })
    await loadPasskeys()
  } finally {
    deletingPasskey.value = null
  }
}

function passkeyLabel(key: PasskeySummary) {
  if (key.name) return key.name
  return key.deviceType === 'multiDevice' ? 'Synced passkey' : 'Security key'
}

function passkeyDetails(key: PasskeySummary) {
  return [
    key.backedUp ? 'synced across devices' : 'this device only',
    key.createdAt ? `added ${format(new Date(key.createdAt), 'PP')}` : null
  ].filter(Boolean).join(' · ')
}

// ─── Two-factor ─────────────────────────────────────────────
// Better Auth asks for the code after a correct password, so it only protects an
// account that has one. Accounts made through OAuth or an email code do not.
const hasPassword = ref<boolean | null>(null)
const twoFactorEnabled = ref(false)
watch(() => (session.value?.user as { twoFactorEnabled?: boolean | null } | undefined)?.twoFactorEnabled, (enabled) => {
  twoFactorEnabled.value = Boolean(enabled)
}, { immediate: true })

const tfPassword = ref('')
const tfCode = ref('')
const tfBusy = ref(false)
// Set between "enable" and the first correct code: the secret exists but is not
// switched on yet, so a mistyped scan cannot lock anyone out.
const pendingTotpUri = ref<string | null>(null)
const backupCodes = ref<string[] | null>(null)

const qrDataUrl = computed(() => pendingTotpUri.value
  ? `data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(pendingTotpUri.value, { border: 2 }))}`
  : null)
const manualSecret = computed(() => pendingTotpUri.value ? new URL(pendingTotpUri.value).searchParams.get('secret') : null)

// Two-factor has one key per account, and any number of apps may hold it: "Add another
// app" shows that key again (after the password) so each extra app can scan it.
const extraAppUri = ref<string | null>(null)
const qrFor = (uri: string) => `data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(uri, { border: 2 }))}`
const secretOf = (uri: string) => new URL(uri).searchParams.get('secret')

// Every two-factor action asks for the password in a dialog first.
type PasswordAction = 'enable' | 'show' | 'backup' | 'disable'
const askFor = ref<PasswordAction | null>(null)
const askOpen = computed({
  get: () => askFor.value !== null,
  set: (open) => {
    if (!open) {
      askFor.value = null
      tfPassword.value = ''
    }
  }
})
const ASKS: Record<PasswordAction, { title: string, label: string }> = {
  enable: { title: 'Set up two-factor authentication', label: 'Continue' },
  show: { title: 'Add another authenticator app', label: 'Show key' },
  backup: { title: 'Create new backup codes', label: 'Create codes' },
  disable: { title: 'Turn off two-factor authentication', label: 'Turn off' }
}
const askTitle = computed(() => ASKS[askFor.value ?? 'enable'].title)
const askLabel = computed(() => ASKS[askFor.value ?? 'enable'].label)

async function confirmPassword() {
  const action = askFor.value
  if (!action || !tfPassword.value) return
  const before = failures
  if (action === 'enable') await startTwoFactor()
  else if (action === 'show') await showKeyAgain()
  else if (action === 'backup') await regenerateBackupCodes()
  else await disableTwoFactor()
  // A wrong password keeps the dialog open so it can be retyped.
  if (failures === before) askOpen.value = false
}

async function loadAccounts() {
  const { data } = await authClient.listAccounts()
  hasPassword.value = (data ?? []).some(account => account.providerId === 'credential')
}

async function startTwoFactor() {
  tfBusy.value = true
  try {
    const { data, error } = await authClient.twoFactor.enable({ password: tfPassword.value })
    if (error || !data) return failed('Could not start two-factor setup', error?.message)
    pendingTotpUri.value = data.totpURI
    backupCodes.value = data.backupCodes
    tfPassword.value = ''
    tfCode.value = ''
  } finally {
    tfBusy.value = false
  }
}

async function confirmTwoFactor() {
  tfBusy.value = true
  try {
    const { error } = await authClient.twoFactor.verifyTotp({ code: tfCode.value.trim() })
    if (error) return failed('That code did not match', error.message)
    pendingTotpUri.value = null
    twoFactorEnabled.value = true
    tfCode.value = ''
    toast.add({ title: 'Two-factor authentication is on', icon: 'i-lucide-shield-check', duration: 2500 })
  } finally {
    tfBusy.value = false
  }
}

function cancelTwoFactorSetup() {
  pendingTotpUri.value = null
  backupCodes.value = null
  tfCode.value = ''
}

async function disableTwoFactor() {
  tfBusy.value = true
  try {
    const { error } = await authClient.twoFactor.disable({ password: tfPassword.value })
    if (error) return failed('Could not turn off two-factor', error.message)
    twoFactorEnabled.value = false
    backupCodes.value = null
    tfPassword.value = ''
    toast.add({ title: 'Two-factor authentication is off', icon: 'i-lucide-shield-off', duration: 2500 })
  } finally {
    tfBusy.value = false
  }
}
async function showKeyAgain() {
  tfBusy.value = true
  try {
    const { data, error } = await authClient.twoFactor.getTotpUri({ password: tfPassword.value })
    if (error || !data) return failed('Could not show the key', error?.message)
    extraAppUri.value = data.totpURI
    tfPassword.value = ''
  } finally {
    tfBusy.value = false
  }
}

async function regenerateBackupCodes() {
  tfBusy.value = true
  try {
    const { data, error } = await authClient.twoFactor.generateBackupCodes({ password: tfPassword.value })
    if (error || !data) return failed('Could not create new backup codes', error?.message)
    backupCodes.value = data.backupCodes
    tfPassword.value = ''
  } finally {
    tfBusy.value = false
  }
}

async function copyBackupCodes() {
  if (!backupCodes.value) return
  try {
    await navigator.clipboard.writeText(backupCodes.value.join('\n'))
    toast.add({ title: 'Backup codes copied', icon: 'i-lucide-check', duration: 2000 })
  } catch {
    failed('Could not copy — select the codes and copy them manually')
  }
}

onMounted(() => {
  loadPasskeys()
  loadAccounts()
})
</script>

<template>
  <div class="rounded-xl border border-default bg-default overflow-hidden">
    <div class="px-5 py-3 border-b border-default bg-elevated/40 flex items-center gap-2">
      <UIcon
        name="i-lucide-shield"
        class="size-4 text-primary"
      />
      <span class="text-xs font-semibold text-muted uppercase tracking-wider">Security</span>
    </div>

    <div class="divide-y divide-default">
      <!-- Passkeys -->
      <div
        v-if="isPasskeysEnabled"
        class="px-5 py-4 space-y-3"
      >
        <div class="flex items-center gap-4">
          <div class="size-8 rounded-lg bg-elevated flex items-center justify-center shrink-0">
            <UIcon
              name="i-lucide-fingerprint"
              class="size-4 text-default"
            />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium">
              Passkeys
            </p>
            <p class="text-xs text-muted mt-0.5">
              Sign in with Touch ID, Windows Hello, your phone or a security key instead of a password
            </p>
          </div>
        </div>

        <div class="pl-12 space-y-3">
          <div class="flex gap-2">
            <UInput
              v-model="newPasskeyName"
              placeholder="Name, e.g. MacBook"
              icon="i-lucide-tag"
              class="flex-1"
              :disabled="addingPasskey"
              @keydown.enter="addPasskey"
            />
            <UButton
              label="Add passkey"
              icon="i-lucide-plus"
              size="sm"
              color="primary"
              :loading="addingPasskey"
              @click="addPasskey"
            />
          </div>

          <p
            v-if="passkeysLoading"
            class="text-xs text-muted"
          >
            Loading passkeys…
          </p>
          <p
            v-else-if="!passkeys.length"
            class="text-xs text-muted"
          >
            No passkeys yet.
          </p>
          <div
            v-else
            class="divide-y divide-default border border-default rounded-lg"
          >
            <div
              v-for="key in passkeys"
              :key="key.id"
              class="px-3 py-2.5 flex items-center gap-3"
            >
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">
                  {{ passkeyLabel(key) }}
                </p>
                <p class="text-xs text-muted mt-0.5 truncate">
                  {{ passkeyDetails(key) }}
                </p>
              </div>
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="xs"
                :aria-label="`Remove ${passkeyLabel(key)}`"
                :loading="deletingPasskey === key.id"
                @click="deletePasskey(key)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Extra addresses: they need two-factor or a passkey, which the sections around them manage -->
      <div class="px-5 py-4">
        <ExtraEmailsPanel />
      </div>

      <!-- Two-factor -->
      <div class="px-5 py-4 space-y-3">
        <div class="flex items-center gap-4">
          <div class="size-8 rounded-lg bg-elevated flex items-center justify-center shrink-0">
            <UIcon
              :name="twoFactorEnabled ? 'i-lucide-shield-check' : 'i-lucide-smartphone'"
              class="size-4"
              :class="twoFactorEnabled ? 'text-primary' : 'text-default'"
            />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium">
              Two-factor authentication
            </p>
            <p class="text-xs text-muted mt-0.5">
              {{ twoFactorEnabled
                ? 'On. Signing in with your password also asks for a code from your authenticator app.'
                : 'Ask for a code from an authenticator app after your password' }}
            </p>
          </div>
        </div>

        <div class="pl-12 space-y-3">
          <p
            v-if="hasPassword === false"
            class="text-xs text-muted"
          >
            Your account signs in without a password, so there is no password sign-in for a code to protect.
          </p>

          <!-- Step 2 of setup: scan and confirm -->
          <template v-else-if="pendingTotpUri">
            <div class="flex flex-wrap items-start gap-4">
              <img
                :src="qrDataUrl!"
                alt="QR code for your authenticator app"
                class="size-40 rounded-lg bg-white p-1"
              >
              <div class="flex-1 min-w-48 space-y-2 text-xs text-muted">
                <p>Scan this with an authenticator app such as Google Authenticator, Dashlane, Bitwarden, 1Password or Aegis, then enter the 6-digit code it shows. Scan it with every app you want to use: each one shows the same codes, and you can add more later from here.</p>
                <p>
                  Cannot scan? Enter this key instead:
                  <code class="block mt-1 font-mono text-default break-all">{{ manualSecret }}</code>
                </p>
              </div>
            </div>
            <div class="flex gap-2">
              <UInput
                v-model="tfCode"
                placeholder="123456"
                inputmode="numeric"
                autocomplete="one-time-code"
                class="flex-1"
                @keydown.enter="confirmTwoFactor"
              />
              <UButton
                label="Turn on"
                icon="i-lucide-shield-check"
                size="sm"
                color="primary"
                :disabled="!tfCode.trim()"
                :loading="tfBusy"
                @click="confirmTwoFactor"
              />
              <UButton
                label="Cancel"
                size="sm"
                color="neutral"
                variant="ghost"
                @click="cancelTwoFactorSetup"
              />
            </div>
          </template>

          <!-- Off, or on and being managed: each action asks for the password in a dialog -->
          <div
            v-else-if="hasPassword"
            class="flex flex-wrap gap-2"
          >
            <UButton
              v-if="!twoFactorEnabled"
              label="Set up"
              icon="i-lucide-qr-code"
              size="sm"
              color="primary"
              @click="askFor = 'enable'"
            />
            <template v-else>
              <UButton
                label="Add another app"
                icon="i-lucide-qr-code"
                size="sm"
                color="neutral"
                variant="soft"
                @click="askFor = 'show'"
              />
              <UButton
                label="New backup codes"
                icon="i-lucide-refresh-cw"
                size="sm"
                color="neutral"
                variant="soft"
                @click="askFor = 'backup'"
              />
              <UButton
                label="Turn off"
                icon="i-lucide-shield-off"
                size="sm"
                color="error"
                variant="soft"
                @click="askFor = 'disable'"
              />
            </template>
          </div>

          <UModal
            v-model:open="askOpen"
            :title="askTitle"
            description="Enter your current password to continue."
          >
            <template #body>
              <form
                class="space-y-4"
                @submit.prevent="confirmPassword"
              >
                <UInput
                  v-model="tfPassword"
                  type="password"
                  placeholder="Current password"
                  autocomplete="current-password"
                  autofocus
                  class="w-full"
                />
                <div class="flex justify-end gap-2">
                  <UButton
                    label="Cancel"
                    color="neutral"
                    variant="ghost"
                    @click="askOpen = false"
                  />
                  <UButton
                    type="submit"
                    :label="askLabel"
                    :color="askFor === 'disable' ? 'error' : 'primary'"
                    :disabled="!tfPassword"
                    :loading="tfBusy"
                  />
                </div>
              </form>
            </template>
          </UModal>

          <!-- Another authenticator app on an account that already has two-factor: the same key -->
          <div
            v-if="extraAppUri && twoFactorEnabled"
            class="flex flex-wrap items-start gap-4"
          >
            <img
              :src="qrFor(extraAppUri)"
              alt="QR code for another authenticator app"
              class="size-40 rounded-lg bg-white p-1"
            >
            <div class="flex-1 min-w-48 space-y-2 text-xs text-muted">
              <p>Scan this in each extra app (Google Authenticator, Dashlane, Bitwarden, 1Password, Aegis...). Every app that holds this key shows the same codes, and any of them signs you in.</p>
              <p>
                Cannot scan? Enter this key instead:
                <code class="block mt-1 font-mono text-default break-all">{{ secretOf(extraAppUri) }}</code>
              </p>
              <UButton
                label="Done"
                size="xs"
                color="neutral"
                variant="soft"
                @click="extraAppUri = null"
              />
            </div>
          </div>

          <!-- Backup codes, shown once after setup or regeneration -->
          <div
            v-if="backupCodes"
            class="rounded-lg border border-default bg-primary/5 p-3 space-y-2"
          >
            <div class="flex items-center gap-2">
              <p class="text-sm font-medium flex-1">
                Backup codes
              </p>
              <UButton
                icon="i-lucide-copy"
                label="Copy"
                size="xs"
                color="neutral"
                variant="ghost"
                @click="copyBackupCodes"
              />
              <UButton
                icon="i-lucide-x"
                size="xs"
                color="neutral"
                variant="ghost"
                aria-label="Dismiss backup codes"
                @click="backupCodes = null"
              />
            </div>
            <p class="text-xs text-muted">
              Each one signs you in once if you lose your authenticator. They are not shown again — store them somewhere safe.
            </p>
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              <code
                v-for="backupCode in backupCodes"
                :key="backupCode"
                class="text-xs font-mono bg-default border border-default rounded px-2 py-1 text-center"
              >{{ backupCode }}</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
