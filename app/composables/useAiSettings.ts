import { computed, ref, watch, type InjectionKey } from 'vue'
import { formatContextLength, formatPricePerMillion } from '~/utils/aiSettingsFormat'

// The AI part of the settings page: the API key, the model choice and its catalogue, and the AI history totals.
// The page reads these refs and calls these functions; nothing here reads the page. The page calls it once and
// provides the result under AI_SETTINGS_KEY, so the stats and the AI section share one set of refs.
export const AI_SETTINGS_KEY: InjectionKey<ReturnType<typeof useAiSettings>> = Symbol('aiSettings')

type ModelCatalog = {
  models: Array<{ id: string, name: string, contextLength: number | null, modality: string | null, inputPrice: number | null, outputPrice: number | null }>
}

const openrouterDocsUrl = 'https://openrouter.ai/keys'

function errMsg(e: unknown): string | undefined {
  return (e as { data?: { message?: string } })?.data?.message
}

export function useAiSettings() {
  const toast = useToast()
  const { openrouterApiKeyMasked, openrouterModel, POPULAR_OPENROUTER_MODELS, setOpenRouterApiKey, setOpenRouterModel } = useUserSettings()

  const apiKeyInput = ref('')
  const showApiKey = ref(false)
  const apiKeySaving = ref(false)
  const apiKeyDirty = computed(() => apiKeyInput.value.trim() !== '')

  const modelInput = ref('')
  const { data: modelCatalog, status: modelCatalogStatus, refresh: refreshModelCatalog } = useFetch<ModelCatalog>('/api/settings/models', { server: false, lazy: true })
  const modelsRefreshing = ref(false)

  const { data: aiHistory } = useFetch<{ totals: { prompts: number, cost: number } }>('/api/settings/ai-history', { server: false, lazy: true })

  const totalPrompts = computed(() => aiHistory.value?.totals.prompts ?? 0)
  const totalAiCost = computed(() => aiHistory.value?.totals.cost ?? 0)

  async function forceRefreshModelCatalog() {
    modelsRefreshing.value = true
    try {
      modelCatalog.value = await $fetch<ModelCatalog>('/api/settings/models?refresh=true')
      toast.add({ title: 'Models and pricing refreshed', icon: 'i-lucide-refresh-cw', duration: 2000 })
    } catch (e) {
      toast.add({ title: 'Could not refresh models', description: errMsg(e), icon: 'i-lucide-alert-triangle', color: 'error' })
    } finally {
      modelsRefreshing.value = false
    }
  }

  const modelOptions = computed(() => {
    const catalog = modelCatalog.value?.models
    const options = catalog?.length
      ? catalog.map(model => ({
          label: model.name,
          value: model.id,
          description: [
            model.id,
            formatContextLength(model.contextLength),
            model.inputPrice !== null ? `Input ${formatPricePerMillion(model.inputPrice)}` : null,
            model.outputPrice !== null ? `Output ${formatPricePerMillion(model.outputPrice)}` : null
          ].filter(Boolean).join(' · ')
        }))
      : POPULAR_OPENROUTER_MODELS.map(model => ({ label: model, value: model, description: 'Popular model' }))

    if (modelInput.value && !options.some(option => option.value === modelInput.value)) {
      options.unshift({ label: modelInput.value, value: modelInput.value, description: 'Current model' })
    }
    return options
  })

  watch(openrouterModel, (v) => {
    modelInput.value = v
  }, { immediate: true })

  async function saveApiKey() {
    if (!apiKeyInput.value.trim()) return
    apiKeySaving.value = true
    try {
      await setOpenRouterApiKey(apiKeyInput.value)
      apiKeyInput.value = ''
      toast.add({ title: 'API key saved', icon: 'i-lucide-check', duration: 2000 })
    } catch (e) {
      toast.add({ title: 'Failed to save API key', description: errMsg(e), icon: 'i-lucide-alert-triangle', color: 'error' })
    } finally {
      apiKeySaving.value = false
    }
  }

  async function clearApiKey() {
    apiKeySaving.value = true
    try {
      await setOpenRouterApiKey('')
      apiKeyInput.value = ''
      toast.add({ title: 'API key removed', icon: 'i-lucide-trash', duration: 2000 })
    } finally {
      apiKeySaving.value = false
    }
  }

  async function changeModel(model: string) {
    try {
      await setOpenRouterModel(model)
      toast.add({ title: 'Model updated', icon: 'i-lucide-check', duration: 1500 })
    } catch (e) {
      toast.add({ title: 'Failed to update model', description: errMsg(e), icon: 'i-lucide-alert-triangle', color: 'error' })
    }
  }

  return {
    apiKeyInput,
    showApiKey,
    apiKeySaving,
    apiKeyDirty,
    modelInput,
    modelCatalogStatus,
    modelsRefreshing,
    modelOptions,
    refreshModelCatalog,
    forceRefreshModelCatalog,
    saveApiKey,
    clearApiKey,
    changeModel,
    openrouterDocsUrl,
    openrouterApiKeyMasked,
    openrouterModel,
    totalPrompts,
    totalAiCost
  }
}
