import { requireInstanceAdmin } from '../../utils/instanceAdmin'
import { DEFAULT_INSTANCE_NAME, INSTANCE_NAME_MAX, brandingOf } from '../../utils/instanceBranding'

// What the instance admin sees on the Branding page. Only the instance admin may read it.
export default defineEventHandler(async (event) => {
  await requireInstanceAdmin(event)
  const branding = await brandingOf()
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return {
    name: branding.name,
    defaultName: DEFAULT_INSTANCE_NAME,
    maxNameLength: INSTANCE_NAME_MAX,
    hasIcon: branding.iconData !== null,
    iconMime: branding.iconMime
  }
})
