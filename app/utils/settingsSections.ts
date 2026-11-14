// The account settings sections, each on its own address (redesign 8/9). The left list and the old hash links both read
// this one table, so a section's address is written once. A hash that is not in the table has no address here.
export interface SettingsSection {
  key: 'stats' | 'account' | 'appearance' | 'api-keys' | 'ai'
  label: string
  path: string
}

export const ACCOUNT_SECTIONS: SettingsSection[] = [
  { key: 'stats', label: 'Your stats', path: '/settings' },
  { key: 'account', label: 'Account', path: '/settings/account' },
  { key: 'appearance', label: 'Appearance', path: '/settings/appearance' },
  { key: 'api-keys', label: 'API keys and MCP', path: '/settings/api-keys' },
  { key: 'ai', label: 'AI', path: '/settings/ai' }
]

// The address a section's old hash link (/settings#account) goes to. Undefined for any other hash.
export function sectionPathForHash(hash: string): string | undefined {
  const key = hash.replace(/^#/, '')
  return ACCOUNT_SECTIONS.find(section => section.key === key)?.path
}
