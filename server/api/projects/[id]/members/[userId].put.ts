import { changeProjectMember, projectPersonRow, routeMembers } from '../../../../utils/projectMembers'
import { maskEmails } from '../../../../utils/emailPrivacy'

// Changes the role of a person who has a project role row. Answers the person's row.
export default defineEventHandler(async (event) => {
  const { project, userId } = await routeMembers(event)
  const targetUserId = getRouterParam(event, 'userId')!
  const body = (await readBody<{ role?: unknown }>(event)) ?? {}

  await changeProjectMember(project, userId, 'ui', targetUserId, body.role)
  const person = await projectPersonRow(project, targetUserId)
  // Only a manager gets this far, and the address still follows its owner's setting.
  return person ? (await maskEmails(userId, [person], { sharesBoard: true, managesBoard: true }))[0] : null
})
