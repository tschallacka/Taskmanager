import { createError } from 'h3'
import { answerWithoutSecrets, audited, createOrRotateCrew, parseCrewInput } from '../../../utils/crewProvisioning'
import { requireInstanceAdmin } from '../../../utils/instanceAdmin'

// Makes (or rotates) a crew from the instance admin's crew wizard. The same request as POST /api/crews, but the
// caller is the admin's session, so no crews:manage key and no window are needed. The answer has no secrets: the
// wizard asks POST /api/admin/crews/:slug/keys for them. Written to the agent audit with the Crews page as the caller.
export default defineEventHandler(async (event) => {
  await requireInstanceAdmin(event)
  const body = await readBody<Record<string, unknown>>(event).catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError({ statusCode: 400, message: 'Send a JSON object.' })
  }
  const input = parseCrewInput(body)
  const caller = { userId: event.context.session.user.id, keyId: null, keyName: 'Crews page' }

  const outcome = await audited(caller, 'create', input.slug, async () => {
    const made = await createOrRotateCrew(input, caller)
    return { result: answerWithoutSecrets(made, input.slug), summary: made.status === 201 ? 'created' : 'rotated keys of' }
  })
  setResponseStatus(event, outcome.status)
  return outcome.body
})
