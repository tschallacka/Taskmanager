// The project settings sections, each on its own address (redesign 8/9, the project settings shell). The list is the
// card's, in order, with Custom fields kept so nothing is removed. Trash and Archive are the danger sections, last.
// The old ?section= values (general, repositories, rules, members, secrets, fields) map to the new keys.

export type ProjectSettingsKey = 'general' | 'members' | 'customers' | 'github' | 'rules' | 'secrets' | 'fields' | 'import' | 'trash' | 'archive'

export interface ProjectSettingsSection {
  key: ProjectSettingsKey
  label: string
  icon: string
  /** The address of the section for a project. */
  path: (projectId: string) => string
}

export const PROJECT_SECTIONS: ProjectSettingsSection[] = [
  { key: 'general', label: 'General', icon: 'i-lucide-sliders-horizontal', path: id => projectSettingsPath(id, 'general') },
  { key: 'members', label: 'Members', icon: 'i-lucide-users', path: id => projectSettingsPath(id, 'members') },
  { key: 'customers', label: 'Customer access', icon: 'i-lucide-building-2', path: id => projectSettingsPath(id, 'customers') },
  { key: 'github', label: 'GitHub', icon: 'i-lucide-git-branch', path: id => projectSettingsPath(id, 'github') },
  { key: 'rules', label: 'Rules', icon: 'i-lucide-workflow', path: id => projectSettingsPath(id, 'rules') },
  { key: 'secrets', label: 'Secrets', icon: 'i-lucide-lock-keyhole', path: id => projectSettingsPath(id, 'secrets') },
  { key: 'fields', label: 'Custom fields', icon: 'i-lucide-list-plus', path: id => projectSettingsPath(id, 'fields') },
  { key: 'import', label: 'Import', icon: 'i-lucide-upload', path: id => projectSettingsPath(id, 'import') },
  { key: 'trash', label: 'Trash', icon: 'i-lucide-trash-2', path: id => projectSettingsPath(id, 'trash') },
  { key: 'archive', label: 'Archive', icon: 'i-lucide-archive', path: id => projectSettingsPath(id, 'archive') }
]

/** The address of one section of a project. */
export function projectSettingsPath(projectId: string, key: ProjectSettingsKey): string {
  return `/projects/${projectId}/settings/${key}`
}

const OLD_QUERY: Record<string, ProjectSettingsKey> = {
  general: 'general',
  repositories: 'github',
  rules: 'rules',
  members: 'members',
  secrets: 'secrets',
  fields: 'fields'
}

/** The section an old ?section= value opens, or undefined for any other value. */
export function sectionKeyForQuery(value: unknown): ProjectSettingsKey | undefined {
  if (typeof value !== 'string') return undefined
  return OLD_QUERY[value]
}
