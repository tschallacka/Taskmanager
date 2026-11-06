import { requireInstanceAdmin } from '../../utils/instanceAdmin'
import { brandingOf, checkIcon, cleanInstanceName, resetBranding, saveBranding } from '../../utils/instanceBranding'

// Sets the instance's name and icon. `icon` is a new { mime, data } (base64), null to go back to the built-in
// icon, or left out to keep the icon there is. `reset: true` brings back the built-in name and icon.
// Only the instance admin may change them.
export default defineEventHandler(async (event) => {
  await requireInstanceAdmin(event)
  const body = await readBody<{ name?: unknown, icon?: unknown, reset?: unknown }>(event)
  if (body?.reset === true) {
    await resetBranding()
    return { ok: true }
  }
  const name = cleanInstanceName(body?.name ?? (await brandingOf()).name)
  let icon: { mime: string, data: string } | null | undefined
  if (body?.icon === null) icon = null
  else if (body?.icon !== undefined) {
    const raw = body.icon as { mime?: unknown, data?: unknown }
    icon = checkIcon(raw.mime, raw.data)
  }
  await saveBranding({ name, icon })
  return { ok: true }
})
