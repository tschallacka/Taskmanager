<script setup lang="ts">
import { inject } from 'vue'
import { AI_SETTINGS_KEY } from '~/composables/useAiSettings'

// AI (OpenRouter): the API key, the model and its catalogue. The state is the page's, provided once (see useAiSettings).
const {
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
  openrouterModel
} = inject(AI_SETTINGS_KEY)!
</script>

<template>
  <div
    id="ai"
    class="rounded-xl border border-default bg-default overflow-hidden"
  >
    <div class="px-5 py-3 border-b border-default bg-elevated/40 flex items-center gap-2">
      <UIcon
        name="i-lucide-sparkles"
        class="size-4 text-primary"
      />
      <span class="text-xs font-semibold text-muted uppercase tracking-wider">AI (OpenRouter)</span>
    </div>
    <p class="px-5 pt-3 text-xs text-muted">
      The key powers the AI chat panel and the AI actions in the editor. Without a key, the chat asks you to add one, and the editor shows a message and stops. <a
        href="https://openrouter.ai/"
        target="_blank"
        rel="noopener"
        class="text-primary underline"
      >What is OpenRouter?</a>
      Sprocket can answer through Claude Code instead, as one of your agents:
      <NuxtLink
        to="/settings/sprocket"
        class="text-primary underline"
      >Sprocket settings</NuxtLink>.
    </p>

    <div class="divide-y divide-default">
      <!-- API key -->
      <div class="px-5 py-4 space-y-3">
        <div class="flex items-center gap-4">
          <div class="size-8 rounded-lg bg-elevated flex items-center justify-center shrink-0">
            <UIcon
              name="i-lucide-key-round"
              class="size-4 text-default"
            />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium">
              API key
            </p>
            <p class="text-xs text-muted mt-0.5">
              Stored securely on your account. Get one at
              <a
                :href="openrouterDocsUrl"
                target="_blank"
                rel="noopener"
                class="text-primary underline"
              >openrouter.ai/keys</a>
            </p>
          </div>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="xs"
            :loading="modelsRefreshing"
            aria-label="Refresh OpenRouter models and pricing"
            title="Reload the model list and prices from OpenRouter"
            @click="forceRefreshModelCatalog"
          />
        </div>

        <div class="pl-12 space-y-2">
          <div
            v-if="openrouterApiKeyMasked"
            class="flex items-center gap-2 text-xs text-muted"
          >
            <UIcon
              name="i-lucide-check-circle-2"
              class="size-3.5 text-primary"
            />
            <span>Current key: <code class="font-mono">{{ openrouterApiKeyMasked }}</code></span>
            <UButton
              size="xs"
              variant="ghost"
              color="error"
              icon="i-lucide-trash-2"
              label="Remove"
              :loading="apiKeySaving"
              @click="clearApiKey"
            />
          </div>

          <div class="flex gap-2">
            <UInput
              v-model="apiKeyInput"
              :type="showApiKey ? 'text' : 'password'"
              placeholder="sk-or-v1-…"
              icon="i-lucide-key"
              class="flex-1"
              :ui="{ trailing: 'pe-1' }"
            >
              <template #trailing>
                <UButton
                  color="neutral"
                  variant="link"
                  size="sm"
                  :icon="showApiKey ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  :aria-label="showApiKey ? 'Hide key' : 'Show key'"
                  @click="showApiKey = !showApiKey"
                />
              </template>
            </UInput>
            <UButton
              label="Save"
              icon="i-lucide-check"
              size="sm"
              color="primary"
              :disabled="!apiKeyDirty"
              :loading="apiKeySaving"
              @click="saveApiKey"
            />
          </div>
        </div>
      </div>

      <!-- Model -->
      <div class="px-5 py-4 space-y-3">
        <div class="flex items-center gap-4">
          <div class="size-8 rounded-lg bg-elevated flex items-center justify-center shrink-0">
            <UIcon
              name="i-lucide-cpu"
              class="size-4 text-default"
            />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium">
              Model
            </p>
            <p class="text-xs text-muted mt-0.5">
              Compare input and output prices per million tokens before choosing a model
            </p>
          </div>
        </div>
        <div class="pl-12">
          <USelectMenu
            v-model="modelInput"
            :items="modelOptions"
            value-key="value"
            placeholder="Pick a model"
            create-item
            virtualize
            :loading="modelCatalogStatus === 'pending'"
            :search-input="{ placeholder: 'Search all OpenRouter models…' }"
            :filter-fields="['label', 'value']"
            class="w-full"
            @update:model-value="changeModel"
            @create="changeModel"
          />
          <p class="text-xs text-muted mt-1.5">
            Active: <code class="font-mono">{{ openrouterModel }}</code>
            <span class="block mt-0.5">
              <template v-if="modelCatalogStatus === 'error'">
                Could not load the catalog.
                <button
                  type="button"
                  class="text-primary underline"
                  @click="refreshModelCatalog()"
                >Try again</button>, or type any OpenRouter slug and press Enter.
              </template>
              <template v-else>
                Prices come from OpenRouter and are shown per million input and output tokens. Search the complete catalog, or type any model slug and press Enter.
              </template>
            </span>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
