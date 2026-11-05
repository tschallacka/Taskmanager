import { migrateApiKeyReach } from '../utils/apiKeyReachMigration'

// Moves keys made before the board picker into the reach tables. Idempotent, so it costs one query once done.
export default defineNitroPlugin(() => {
  migrateApiKeyReach()
    .then((count) => {
      if (count.keys) console.info(`[api-keys] moved the reach of ${count.keys} keys to the board tables`)
    })
    .catch((error) => {
      console.error('[api-keys] could not move the key reach; is the schema pushed?', error)
    })
})
