import { requireInstanceAdmin } from '../../utils/instanceAdmin'
import { sprocketInstanceView } from '../../utils/sprocketInstance'

// The instance admin's Sprocket settings. The key comes back masked (its last four characters), never in full.
export default defineEventHandler(async (event) => {
  await requireInstanceAdmin(event)
  return sprocketInstanceView()
})
