// The extra workers a crew board can add later: not forked with the standard members, run on a local model.
// One list for everything that names them: the server forks them (server/utils/crewForks.ts), the Crews panel
// offers them (app/composables/useTeamCrews.ts), and the crew kit names them (crew/config.mjs EXTRA_CAST).
// crew/kit.test.mjs fails when the kit's list and this one differ.
export const EXTRA_WORKERS = [
  { key: 'wes', name: 'Wes Worker' },
  { key: 'wilma', name: 'Wilma Worker' },
  { key: 'walt', name: 'Walt Worker' }
] as const
