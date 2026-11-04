import { personView } from '../../utils/personCard'

// A person the caller shares a board with: their name, the boards you both work on, and what is
// assigned to them there that you may read. Someone you share no board with is not found.
export default defineEventHandler(async (event) => {
  const view = await personView(event.context.session.user.id, getRouterParam(event, 'id')!)
  if (!view) throw createError({ statusCode: 404, message: 'Person not found' })
  return view
})
