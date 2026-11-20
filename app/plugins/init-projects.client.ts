import MiniSearch from 'minisearch'
import { initProjectsStore } from '~/composables/useProjects'
import { loadInitialProjects } from '~/utils/projectsInitialLoad'
import type { Project } from '~/composables/useProjects'
import { readSession } from '~/composables/useAuth'

type BoardSearchDoc = { id: string, type: 'project' | 'task', name: string, title: string, descriptionText: string }

export default defineNuxtPlugin(async () => {
  const { data: session } = await readSession()
  if (!session) return

  // A tab coming back to the front reads the open board again, so a blocker finished in another tab shows
  // here. A return can fire visibilitychange alone, so that is the only trigger; the guard keeps one reload per return.
  const { activeProjectId, reloadBoardQuiet } = useProjects()
  // Never removed: the listener lives as long as the app, and this plugin runs once for it.
  let lastReturn = 0
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    const now = Date.now()
    if (now - lastReturn < 1000) return
    lastReturn = now
    if (activeProjectId.value) reloadBoardQuiet(activeProjectId.value)
  })

  const boardSearch = new MiniSearch<BoardSearchDoc>({
    idField: 'id',
    fields: ['name', 'title', 'descriptionText'],
    storeFields: ['id'],
    searchOptions: {
      boost: { title: 2, name: 2 },
      prefix: true,
      fuzzy: 0.2
    }
  })

  // A failed first read is retried once, and the store is initialised only with the full answer, so the search index is set. If the
  // retry fails too, the store stays not ready and the page keeps its loading line (not "No projects yet"). The task list is loaded
  // on first use (ensureTasks), not here.
  await loadInitialProjects(
    () => $fetch<Project[]>('/api/projects'),
    projects => initProjectsStore(projects, boardSearch)
  )
})
