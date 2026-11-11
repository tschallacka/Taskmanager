<script setup lang="ts">
import { format } from 'date-fns'
import { permissionName } from '~/utils/connectPrompt'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Approve a connection' })

interface ApprovalBoard {
  boardId: string
  name: string | null
  workspace: string | null
  scopes: string[]
  available: boolean
}

interface ApprovalView {
  clientName: string
  expiresAt: number
  canManageCrews: boolean
  boards: ApprovalBoard[]
}

const route = useRoute()
const toast = useToast()

// The code comes from the link the agent gave; it can also be typed here.
const typed = ref(typeof route.query.code === 'string' ? route.query.code : '')
const view = ref<ApprovalView | null>(null)
// Per board, the permissions the person keeps. Only what the request asked for can be ticked.
const picked = ref<Record<string, string[]>>({})
const loading = ref(false)
const answered = ref<'approved' | 'denied' | null>(null)
const problem = ref('')

function errMsg(e: unknown): string {
  return (e as { data?: { message?: string } })?.data?.message ?? 'Something went wrong. Try again.'
}

async function load() {
  problem.value = ''
  loading.value = true
  try {
    const result = await $fetch<ApprovalView>('/api/settings/device-requests', { query: { code: typed.value.trim() } })
    view.value = result
    // Everything asked for starts ticked, except a crew permission the person may not give.
    picked.value = Object.fromEntries(result.boards
      .filter(board => board.available)
      .map(board => [board.boardId, board.scopes.filter(scope => scope !== 'crews:manage' || result.canManageCrews)]))
  } catch (e) {
    view.value = null
    problem.value = errMsg(e)
  } finally {
    loading.value = false
  }
}

function isOn(boardId: string, scope: string): boolean {
  return (picked.value[boardId] ?? []).includes(scope)
}

function toggle(boardId: string, scope: string, on: boolean) {
  const current = picked.value[boardId] ?? []
  const next = on ? [...new Set([...current, scope])] : current.filter(item => item !== scope)
  picked.value = { ...picked.value, [boardId]: next }
}

const grantCount = computed(() => Object.values(picked.value).filter(scopes => scopes.length).length)

async function decide(decision: 'approve' | 'deny') {
  if (!view.value) return
  const boards = Object.entries(picked.value)
    .filter(([, scopes]) => scopes.length)
    .map(([boardId, scopes]) => ({ boardId, scopes }))
  loading.value = true
  try {
    await $fetch('/api/settings/device-requests', {
      method: 'POST',
      body: { code: typed.value.trim(), decision, boards }
    })
    answered.value = decision === 'approve' ? 'approved' : 'denied'
  } catch (e) {
    toast.add({ title: 'Could not answer the request', description: errMsg(e), icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    loading.value = false
  }
}

function expiresText(expiresAt: number): string {
  return format(new Date(expiresAt), 'p')
}

onMounted(() => {
  if (typed.value) load()
})
</script>

<template>
  <div class="flex-1 min-w-0 flex flex-col overflow-hidden pb-14 lg:pb-0">
    <!-- The title goes into the shared top bar. -->
    <Teleport
      defer
      to="#app-topbar-title"
    >
      <h1 class="font-semibold text-sm">
        Approve a connection
      </h1>
    </Teleport>

    <div class="flex-1 overflow-y-auto">
      <UContainer class="py-6 px-4 max-w-2xl space-y-4">
        <form
          v-if="!view && !answered"
          class="rounded-xl border border-default bg-default px-5 py-4 space-y-3"
          data-approve-code
          @submit.prevent="load"
        >
          <p class="text-sm font-medium">
            Enter the code your Claude showed you
          </p>
          <p class="text-sm text-muted">
            The code looks like ABCD-EFGH. It is in the message your Claude gave you, next to the link.
          </p>
          <div class="flex flex-wrap gap-2">
            <UInput
              v-model="typed"
              placeholder="ABCD-EFGH"
              autocomplete="off"
              class="min-w-0 flex-1"
              aria-label="Code"
            />
            <UButton
              type="submit"
              :loading="loading"
              :disabled="!typed.trim()"
            >
              Look up
            </UButton>
          </div>
          <p
            v-if="problem"
            class="text-sm text-error"
            role="alert"
          >
            {{ problem }}
          </p>
        </form>

        <section
          v-if="view && !answered"
          class="rounded-xl border border-default bg-default px-5 py-4 space-y-4"
          data-approve-request
        >
          <div class="space-y-1">
            <p class="text-sm font-medium">
              {{ view.clientName }} asks to connect to your Taskmanager
            </p>
            <p class="text-sm text-muted">
              It asks for the boards below, with the permissions listed. Untick anything it should not have. You can take
              away, but not add. Answer before {{ expiresText(view.expiresAt) }}.
            </p>
          </div>

          <div
            v-for="board in view.boards"
            :key="board.boardId"
            class="rounded-lg border border-default px-4 py-3 space-y-2"
            :data-approve-board="board.boardId"
          >
            <template v-if="board.available">
              <p class="text-sm font-medium">
                {{ board.name }} <span class="text-muted font-normal">({{ board.workspace }})</span>
              </p>
              <div class="flex flex-col gap-2">
                <UCheckbox
                  v-for="scope in board.scopes"
                  :key="scope"
                  :model-value="isOn(board.boardId, scope)"
                  :disabled="scope === 'crews:manage' && !view.canManageCrews"
                  :label="permissionName(scope)"
                  @update:model-value="(on: boolean | 'indeterminate') => toggle(board.boardId, scope, on === true)"
                />
              </div>
            </template>
            <p
              v-else
              class="text-sm text-muted"
            >
              A board the request asks for is not one you can open, so it cannot be approved.
            </p>
          </div>

          <p
            v-if="view.boards.some(board => board.scopes.includes('crews:manage')) && !view.canManageCrews"
            class="text-xs text-muted"
          >
            The manage crews permission can only be given by the instance admin.
          </p>

          <div class="flex flex-wrap gap-2 pt-1">
            <UButton
              data-approve-confirm
              :loading="loading"
              :disabled="grantCount === 0"
              icon="i-lucide-check"
              @click="decide('approve')"
            >
              Approve
            </UButton>
            <UButton
              color="neutral"
              variant="outline"
              data-approve-deny
              :disabled="loading"
              @click="decide('deny')"
            >
              Deny
            </UButton>
          </div>
        </section>

        <div
          v-if="answered === 'approved'"
          class="rounded-xl border border-primary/30 bg-primary/5 px-5 py-4 space-y-1"
          data-approve-done
        >
          <p class="text-sm font-medium">
            Approved
          </p>
          <p class="text-sm text-muted">
            Your Claude gets its connection the next time it checks. You can close this page.
          </p>
        </div>
        <div
          v-if="answered === 'denied'"
          class="rounded-xl border border-default bg-default px-5 py-4 space-y-1"
          data-approve-done
        >
          <p class="text-sm font-medium">
            Denied
          </p>
          <p class="text-sm text-muted">
            Nothing was connected. You can close this page.
          </p>
        </div>
      </UContainer>
    </div>
  </div>
</template>
