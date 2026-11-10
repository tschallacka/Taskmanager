import { createError } from 'h3'
import { requireInstanceAdmin } from '../../utils/instanceAdmin'
import { saveSprocketInstance, sprocketInstanceView } from '../../utils/sprocketInstance'
import type { SprocketInstancePatch } from '../../utils/sprocketInstance'

// Saves the instance's Sprocket settings: the switch for everyone, the model, the OpenRouter key (null clears it,
// absent keeps it) and the daily limits. Only the instance admin may save. Answers with the masked view.
export default defineEventHandler(async (event) => {
  await requireInstanceAdmin(event)
  const body = await readBody<Record<string, unknown>>(event).catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError({ statusCode: 400, message: 'Send a JSON object.' })
  }
  const patch: SprocketInstancePatch = {}
  if ('forEveryone' in body) patch.forEveryone = body.forEveryone === true
  if ('model' in body) patch.model = String(body.model ?? '')
  if ('apiKey' in body) patch.apiKey = typeof body.apiKey === 'string' || body.apiKey === null ? body.apiKey : undefined
  if ('userDailyLimit' in body) patch.userDailyLimit = Number(body.userDailyLimit)
  if ('instanceDailyCap' in body) patch.instanceDailyCap = Number(body.instanceDailyCap)
  if ('defaultManner' in body) patch.defaultManner = String(body.defaultManner ?? '')

  await saveSprocketInstance(patch, event.context.session.user.id)
  return sprocketInstanceView()
})
