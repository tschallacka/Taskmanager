import { requireInstanceAdmin } from '../../utils/instanceAdmin'
import { brandAdminView } from '../../utils/brand'

// The instance branding as the instance admin sees it. Instance admin only.
export default defineEventHandler(async (event) => {
  await requireInstanceAdmin(event)
  return brandAdminView()
})
