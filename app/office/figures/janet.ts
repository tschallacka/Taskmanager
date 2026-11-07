// Janet Janitor: the look of the crew's janitor. Her tools are the rig's `broom` and `mop` props (meshes.ts), shown
// one at a time by the actor while she cleans a desk.
import type { Look } from '../meshes'

export const look: Look = {
  shirt: '#6c757d',
  pants: '#343a40',
  skin: '#e0ac69',
  hair: '#7a4b2a',
  headwear: 'ponytail',
  glasses: 'round'
}

export const JANET_TOOLS = ['broom', 'mop'] as const
