import type { RouterConfig } from '@nuxt/schema'

// The board's address with a task, and a comment, in the path: /projects/<id>/<task>/<comment?>. It renders the same
// board page as /projects/<id>, so the task panel stays one component (Boss, 2026-11-11).
export default <RouterConfig>{
  routes: (routes) => {
    const board = routes.find(route => route.path === '/projects/:id()')
    if (!board) return routes
    return [
      ...routes,
      { ...board, path: '/projects/:id()/:task()/:comment?', name: 'projects-id-task' }
    ]
  }
}
