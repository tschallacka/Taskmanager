// The first project load in the browser, as a function the plugin calls with its fetches and its store initialiser. A failed read is
// retried once. The store is initialised only with a full answer (projects and tasks), so the search index is set when the list is
// shown. When the retry fails too, the store stays not ready: nothing is handed over as an empty list.

export async function loadInitialProjects<P, T>(
  fetchProjects: () => Promise<P[]>,
  fetchTasks: () => Promise<T[]>,
  init: (projects: P[], tasks: T[]) => void
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const [projects, tasks] = await Promise.all([fetchProjects(), fetchTasks()])
      init(projects, tasks)
      return true
    } catch {
      // The second failure is final: the caller's page keeps its loading line.
    }
  }
  return false
}
