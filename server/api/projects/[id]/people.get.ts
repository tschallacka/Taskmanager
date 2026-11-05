import { requireProject } from '../../../utils/projects'
import { projectPeople } from '../../../utils/people'
import { maskEmails } from '../../../utils/emailPrivacy'
import { vaultRoleOf } from '../../../utils/projectMembers'

// Everyone a task on this board can be assigned to, for the assignee picker and
// for drawing an assignee's name and avatar. An address shows only to a viewer its owner allows.
export default defineEventHandler(async (event) => {
  const project = await requireProject(event, getRouterParam(event, 'id')!)
  const viewerId = event.context.session.user.id
  const managesBoard = (await vaultRoleOf(project, viewerId)) === 'manager'
  return maskEmails(viewerId, await projectPeople(project), { sharesBoard: true, managesBoard })
})
