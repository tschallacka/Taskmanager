import { createError } from 'h3'
import { requireInstanceAdmin } from '../../utils/instanceAdmin'
import { brandAdminView, saveBrand } from '../../utils/brand'

// Saves the instance's app name and logo. `name: null` and `logoSvg: null` reset them to the defaults. Only the
// instance admin may save. Answers with the saved view.
export default defineEventHandler(async (event) => {
  await requireInstanceAdmin(event)
  const body = await readBody<Record<string, unknown>>(event).catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError({ statusCode: 400, message: 'Send a JSON object.' })
  }
  await saveBrand({ name: body.name, logoSvg: body.logoSvg }, event.context.session.user.id)
  return brandAdminView()
})
