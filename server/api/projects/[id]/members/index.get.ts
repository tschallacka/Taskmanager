import { listProjectPeople, routeMembers } from '../../../../utils/projectMembers'
import { maskEmails } from '../../../../utils/emailPrivacy'

// Who is on the project and in what vault role. Any staff member may read it; only
// a manager may change it. A customer's contact gets a 404.
export default defineEventHandler(async (event) => {
  const { project, role } = await routeMembers(event)
  return {
    canManage: role === 'manager',
    personal: !project.teamId,
    role,
    people: await maskEmails(event.context.session.user.id, await listProjectPeople(project), { sharesBoard: true, managesBoard: role === 'manager' })
  }
})
