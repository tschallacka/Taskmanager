import { exportAccount } from '../../utils/accountExport'

// The signed-in person's download (Art. 20): a JSON file of what they own, are a member of, and wrote. The person is taken
// from the session, never from the request. The file is sent as an attachment and is not cached. Secrets and other people's
// data are not in it (see utils/accountRules.ts, EXPORT_RULES).
export default defineEventHandler(async (event) => {
  const me = event.context.session.user
  const data = await exportAccount(me.id)
  setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
  setHeader(event, 'Content-Disposition', 'attachment; filename="taskmanager-account-export.json"')
  setHeader(event, 'Cache-Control', 'no-store')
  return data
})
