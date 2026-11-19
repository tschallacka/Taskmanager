// The instance admin's sections, each on its own address (redesign 8/9). The Accounts list is a page here, and the same
// list is still a modal on Instance settings. A later card (mwasus18611939jk1av) adds its own sections to this table.
export interface AdminSection {
  key: 'accounts' | 'crews' | 'settings'
  label: string
  path: string
  icon: string
}

export const ADMIN_SECTIONS: AdminSection[] = [
  { key: 'accounts', label: 'Accounts', path: '/admin/accounts', icon: 'i-lucide-users' },
  { key: 'crews', label: 'Crews', path: '/admin/crews', icon: 'i-lucide-bot' },
  { key: 'settings', label: 'Instance settings', path: '/admin/settings', icon: 'i-lucide-settings' }
]
