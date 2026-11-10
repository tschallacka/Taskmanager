// Sprocket's manner: the tone of its answers, picked per person and set as the site default by the instance admin.
// One table serves both answering paths (OpenRouter in chat.post.ts and Claude Code in sprocketAgent.ts). A manner
// block changes only the tone. It never changes what Sprocket may do, its tools or its rules, which stay in the fixed
// part of each system prompt.

export const SPROCKET_MANNERS = ['professional', 'friendly', 'concise', 'playful', 'teacher'] as const
export type SprocketManner = typeof SPROCKET_MANNERS[number]

export const SPROCKET_DEFAULT_MANNER: SprocketManner = 'professional'

export interface MannerInfo {
  id: SprocketManner
  label: string
  /** One line the picker shows, the same question answered in this manner. */
  sample: string
  /** The block added to the system prompt for this manner. */
  block: string
}

export const MANNER_TABLE: Record<SprocketManner, MannerInfo> = {
  professional: {
    id: 'professional',
    label: 'Professional',
    sample: 'Two tasks are overdue on Launch: "Write the release notes" and "Ship the beta".',
    block: 'Manner: professional. Be businesslike and plain. No exclamation marks, no emoji, no jokes, no small talk. State the facts first, then what they mean for the work.'
  },
  friendly: {
    id: 'friendly',
    label: 'Friendly',
    sample: 'Good news, Launch is nearly there. Two tasks are overdue: "Write the release notes" and "Ship the beta".',
    block: 'Manner: friendly. Be warm and relaxed, like a helpful colleague. Speak directly to the person and keep the answer easy to read.'
  },
  concise: {
    id: 'concise',
    label: 'Concise',
    sample: 'Overdue on Launch: Write the release notes; Ship the beta.',
    block: 'Manner: concise. Give the shortest answer that does the job, facts first. Leave out preamble, recaps and closing offers.'
  },
  playful: {
    id: 'playful',
    label: 'Playful',
    sample: 'Ooh, two overdue tasks on Launch! "Write the release notes" and "Ship the beta" are wiggling their way past the deadline.',
    block: 'Manner: playful. Be bouncy and lively, with a light touch of humour, at most one joke per reply. The answer itself stays accurate and complete.'
  },
  teacher: {
    id: 'teacher',
    label: 'Teacher',
    sample: 'Two tasks are overdue. Here is why it matters and what to do: first check the due dates, then move each task to the top of To do.',
    block: 'Manner: teacher. Explain the why and the steps, for someone new to Taskmanager. Name the page or control to use, and say what each step achieves.'
  }
}

export function isSprocketManner(value: unknown): value is SprocketManner {
  return typeof value === 'string' && (SPROCKET_MANNERS as readonly string[]).includes(value)
}

/** The manner that answers: the person's own pick, else the site default, else Professional. */
export function resolveManner(pick: string | null | undefined, siteDefault: string | null | undefined): SprocketManner {
  if (isSprocketManner(pick)) return pick
  if (isSprocketManner(siteDefault)) return siteDefault
  return SPROCKET_DEFAULT_MANNER
}

/** The manner block for a system prompt. The fixed rules are never part of it, so they hold in every manner. */
export function mannerBlock(manner: SprocketManner): string {
  return `${MANNER_TABLE[manner].block}\nWhere the manner and the character line above differ, the manner wins; the rules above still hold.`
}

/** The system prompt of one answer: the fixed part, then the manner block for this person. */
export function promptWithManner(fixed: string, manner: SprocketManner): string {
  return `${fixed}\n\n${mannerBlock(manner)}`
}
