// The instance admin's sections, each on its own address (redesign 8/9). The Accounts list is a modal on Instance settings,
// not a page, so it has no address here. A later card (mwasus18611939jk1av) adds its own sections to this table.
export interface AdminSection {
  key: 'settings' | 'crews'
  label: string
  path: string
  icon: string
}

export const ADMIN_SECTIONS: AdminSection[] = [
  { key: 'settings', label: 'Instance settings', path: '/admin/settings', icon: 'i-lucide-settings' },
  { key: 'crews', label: 'Crews', path: '/admin/crews', icon: 'i-lucide-bot' }
]
