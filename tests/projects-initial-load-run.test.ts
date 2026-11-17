// The first project load, run (not read): a failed first read is retried once and then the store is initialised with the search index, so search
// works after a retry; a second failure leaves the store not ready, with no empty list shown as the answer.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadInitialProjects } from '../app/utils/projectsInitialLoad'

function works<T>(value: T): () => Promise<T> {
  return async () => {
    return value
  }
}

function fails(reason: string): () => Promise<never> {
  return async () => {
    throw new Error(reason)
  }
}

test('a first read that works initialises the store once, with its projects and tasks', async () => {
  const calls: unknown[][] = []
  const done = await loadInitialProjects(works(['p1']), works(['t1']), (projects, tasks) => {
    calls.push([projects, tasks])
  })
  assert.equal(done, true)
  assert.deepEqual(calls, [[['p1'], ['t1']]])
})

test('a failed first read is retried once; when the retry works, the store is initialised with the retry data (search included)', async () => {
  let projectReads = 0
  const calls: unknown[][] = []
  const fetchProjects = async () => {
    projectReads += 1
    if (projectReads === 1) throw new Error('first read failed')
    return ['p1']
  }
  const done = await loadInitialProjects(fetchProjects, works(['t1']), (projects, tasks) => {
    calls.push([projects, tasks])
  })
  assert.equal(done, true)
  assert.equal(projectReads, 2)
  assert.deepEqual(calls, [[['p1'], ['t1']]], 'the store is initialised once, so the search index is set')
})

test('when the retry fails too, the store is not initialised and no empty list is handed over', async () => {
  const calls: unknown[][] = []
  const done = await loadInitialProjects(fails('down'), fails('down'), (projects, tasks) => {
    calls.push([projects, tasks])
  })
  assert.equal(done, false)
  assert.deepEqual(calls, [], 'init is never called, so the list is not marked ready with nothing in it')
})
