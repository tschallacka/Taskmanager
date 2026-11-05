import { renameCrewPersonKeys } from '../utils/crewKeyRename'

// A crew made before the person keys were renamed (w1..w4, pietje, pm, nitpicker) gets the new ones. Idempotent.
export default defineNitroPlugin(() => {
  renameCrewPersonKeys()
    .then((count) => {
      const moved = count.accounts + count.keys + count.members
      if (moved) console.info(`[crew-keys] moved ${count.accounts} accounts, ${count.keys} key names and ${count.members} fork members to the new person keys`)
    })
    .catch((error) => {
      console.error('[crew-keys] could not rename the person keys; is the schema pushed?', error)
    })
})
