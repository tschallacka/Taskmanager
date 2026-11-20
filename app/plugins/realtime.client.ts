import { readSession } from '~/composables/useAuth'

// Opens the live-update socket for a signed-in user. The stores are already
// seeded by init-projects.client.ts by the time this runs, so the first event
// has something to refresh.
export default defineNuxtPlugin(async () => {
  const { data: session } = await readSession()
  if (!session) return

  useRealtime().start()
  // The inbox is read once and then kept current by the same socket.
  useNotifications().init()
})
