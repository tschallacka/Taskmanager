import { fileURLToPath } from 'node:url'
import { send, setResponseHeader, setResponseStatus } from 'h3'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({

  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vite-pwa/nuxt'
  ],

  ssr: false,

  devtools: {
    enabled: process.env.NODE_ENV !== 'production'
  },

  css: ['~/assets/css/main.css'],

  // Dark is the default; someone who chose light or system keeps that choice in their browser.
  colorMode: { preference: 'dark' },
  runtimeConfig: {
    public: {
      discordEnabled: false,
      githubEnabled: false,
      googleEnabled: false,
      oidcEnabled: false,
      // Label for the sign-in button, e.g. the name of your Authentik or Keycloak.
      oidcName: 'Single sign-on',
      emailCodeEnabled: false,
      passkeysEnabled: true,
      allowSignUp: true
    }
  },

  compatibilityDate: '2025-01-15',

  nitro: {
    preset: 'bun',
    // The help pages in docs/ ship inside the server build, so a deployed instance has the same
    // pages the repository has. server/utils/helpStore.ts reads them as `assets:docs`.
    serverAssets: [{ baseName: 'docs', dir: fileURLToPath(new URL('./docs', import.meta.url)) }],
    // In dev, a server error is printed as plain text with its stack and answered
    // as JSON. The default renderer (youch) reads source maps through a
    // WebAssembly parser that traps ("unreachable") on this project's bundles,
    // which hid the original error and took the dev worker down with it.
    devErrorHandler: (error, event) => {
      console.error(`[dev] ${event.method} ${event.path} -> ${error.statusCode}:`, error.stack ?? error.message)
      setResponseStatus(event, error.statusCode || 500, error.statusMessage)
      setResponseHeader(event, 'content-type', 'application/json')
      return send(event, JSON.stringify({
        statusCode: error.statusCode || 500,
        statusMessage: error.statusMessage,
        message: error.message,
        data: error.data
      }))
    },
    // Live updates: the browser listens on /_ws for changes made elsewhere —
    // an AI agent over MCP, a teammate, another tab.
    experimental: {
      websocket: true
    },
    typescript: {
      tsConfig: {
        compilerOptions: {
          // Notes are stored as editor HTML, so the API parses and rewrites it
          // through a server-side DOM implementation. That code needs the DOM
          // interface types, which Nitro leaves out by default.
          lib: ['esnext', 'webworker', 'dom', 'dom.iterable']
        }
      }
    }
  },

  vite: {
    resolve: {
      dedupe: [
        '@tiptap/core',
        '@tiptap/pm',
        'prosemirror-model',
        'prosemirror-state',
        'prosemirror-tables',
        'prosemirror-view'
      ]
    },
    optimizeDeps: {
      include: [
        '@nuxt/ui > prosemirror-state',
        '@nuxt/ui > prosemirror-transform',
        '@nuxt/ui > prosemirror-model',
        '@nuxt/ui > prosemirror-view',
        '@nuxt/ui > prosemirror-gapcursor',
        '@tiptap/extension-table',
        '@tiptap/pm/tables'
      ]
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Taskmanager',
      short_name: 'Taskmanager',
      description: 'Self-hosted projects, tasks and notes',
      theme_color: '#18181b',
      background_color: '#18181b',
      display: 'standalone',
      orientation: 'portrait',
      scope: '/',
      start_url: '/',
      icons: [
        {
          src: 'logo.svg',
          sizes: 'any',
          type: 'image/svg+xml',
          purpose: 'any'
        },
        {
          src: 'pwa-64x64.png',
          sizes: '64x64',
          type: 'image/png'
        },
        {
          src: 'pwa-192x192.png',
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: 'pwa-512x512.png',
          sizes: '512x512',
          type: 'image/png'
        },
        {
          src: 'maskable-icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable'
        }
      ]
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,ico}'],
      // Web Push: show what the server sends and open it on a click.
      importScripts: ['/push-sw.js']
    },
    client: {
      installPrompt: true
    },
    devOptions: {
      enabled: false,
      type: 'module'
    }
  }
})
