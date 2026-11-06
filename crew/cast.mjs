// The crew's cast and the plan for a forked member, with no file read: the kit's tests and init use it without a
// crew home. config.mjs re-exports these for the rest of the kit.

// Extra workers on a board (EXTRA_WORKERS in shared/utils/extraWorkers.ts): forked later, run on a local model
// through opencode. The kit knows them so their forks can be read, but init writes no agent definition for them.
export const EXTRA_CAST = ['wes', 'wilma', 'walt']

// The members Pia starts as agents (Pia herself runs in her own session), the optional log watcher included,
// and the extra workers, whose forks play their role.
export const CAST = ['pia', 'wren', 'wick', 'wynn', 'wade', 'usher', 'nina', 'quincy', 'watcher', ...EXTRA_CAST]

/**
 * What init does with one member of a forks file: `write` an agent definition for a standard member, `skip` an
 * extra worker (it runs on its own model), or `unknown` for a key the kit does not know, which is an error.
 */
export function forkMemberPlan(key) {
  if (EXTRA_CAST.includes(key)) return 'skip'
  if (CAST.includes(key)) return 'write'
  return 'unknown'
}

/** The cast role a fork plays, from its agent type: `taskmanager-wren` plays `wren`. Null when it names none. */
export function forkRole(agentType) {
  const last = String(agentType).split('-').pop()
  return [...CAST, ...EXTRA_CAST].includes(last) ? last : null
}
