import { parseEmailAudience, setEmailAudience } from '../../utils/emailPrivacy'

// Sets how far the caller's own address may travel. Only the account's owner can: the id comes from the session.
export default defineEventHandler(async (event) => {
  const body = (await readBody<{ level?: unknown }>(event)) ?? {}
  const level = parseEmailAudience(body.level)
  if (!level) throw createError({ statusCode: 400, message: 'Choose one of: owner, manager, team, guests, everyone' })
  await setEmailAudience(event.context.session.user.id, level)
  return { level }
})
