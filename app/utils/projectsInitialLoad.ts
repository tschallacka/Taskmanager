// The first project load in the browser, as a function the plugin calls with its fetch and its store initialiser. A failed read is
// retried once. The store is initialised with the projects, so the project search is set when the list is shown. The task list is
// not part of this load: it loads on first use (ensureTasks). When the retry fails too, the store stays not ready: nothing is handed
// over as an empty list.

export async function loadInitialProjects<P>(
  fetchProjects: () => Promise<P[]>,
  init: (projects: P[]) => void
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const projects = await fetchProjects()
      init(projects)
      return true
    } catch {
      // The second failure is final: the caller's page keeps its loading line.
    }
  }
  return false
}
