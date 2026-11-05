import { emailAudienceOf, EMAIL_AUDIENCES } from '../../utils/emailPrivacy'

// How far the caller's own address may travel, and the steps on offer. The default is "owner": nobody else.
export default defineEventHandler(async (event) => {
  return { level: await emailAudienceOf(event.context.session.user.id), levels: EMAIL_AUDIENCES }
})
