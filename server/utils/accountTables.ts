// The account's table list: every table in server/db/schema.ts, classified once. The account download (this card, mwjfpr8phz5gi4bdjqa)
// and the account deletion (card mwidrtw6jigffzbe5) both read it, so there is one list of the tables.
//
// The classes:
// - export: the person's own rows. Only the listed columns are exported (an allow-list, so a new column is not exported by accident).
//   `scope` says which rows: 'own' (rows the person wrote or owns), or 'member' (the person's memberships, nothing about other people).
// - secret: keys, hashes, sessions, tokens, passwords, pairing codes, invitation tokens. Never exported, never copied.
// - other: other people's rows or the board's own data that is not the person's to take. Never exported.
// - system: infrastructure rows (rate limits, caches, deliveries). Not a person's data.

export type TableClass = 'export' | 'secret' | 'other' | 'system'

export interface AccountTable {
  class: TableClass
  /** For 'export': which rows of the table belong to the person. */
  scope?: 'own' | 'member'
  /** For 'export': the only columns that may leave the server. */
  fields?: string[]
  /** Why, in a few words. */
  why: string
}

/** A column name that must never be exported: keys, hashes, tokens, passwords, codes, sessions. */
export const SECRET_COLUMN = /hash|token|secret|password|passkey|key|prefix|salt|otp|code|session|ciphertext|backup|credential/i

export const ACCOUNT_TABLES: Record<string, AccountTable> = {
  // The person and their own settings.
  user: { class: 'export', scope: 'own', fields: ['id', 'name', 'email', 'email_verified', 'image', 'created_at'], why: 'the account' },
  userEmail: { class: 'export', scope: 'own', fields: ['email', 'verified_at', 'created_at'], why: 'extra addresses' },
  userSettings: { class: 'export', scope: 'own', fields: ['primary_color', 'neutral_color'], why: 'personal settings; the AI key is not exported' },
  notificationPreferences: { class: 'export', scope: 'own', fields: ['email', 'browser'], why: 'notification choices' },
  boardPins: { class: 'export', scope: 'own', fields: ['project_id', 'created_at'], why: 'boards the person pinned' },

  // Memberships: what the person is in, not who else is.
  member: { class: 'export', scope: 'member', fields: ['organization_id', 'role', 'created_at'], why: 'team memberships' },
  organization: { class: 'export', scope: 'member', fields: ['id', 'name', 'slug', 'created_at'], why: 'the teams named in the memberships' },
  projectMembers: { class: 'export', scope: 'member', fields: ['project_id', 'role', 'created_at'], why: 'board memberships' },
  projectGuests: { class: 'export', scope: 'member', fields: ['project_id', 'role', 'created_at'], why: 'boards shared with the person' },
  projects: { class: 'export', scope: 'member', fields: ['id', 'name', 'team_id', 'created_at'], why: 'the boards named in the memberships' },

  // What the person wrote.
  projectTasks: { class: 'export', scope: 'own', fields: ['id', 'project_id', 'title', 'description', 'completed_at', 'created_at', 'updated_at'], why: 'tasks the person created' },
  taskComments: { class: 'export', scope: 'own', fields: ['id', 'task_id', 'body', 'visibility', 'created_at', 'edited_at'], why: 'comments the person wrote' },
  timeEntries: { class: 'export', scope: 'own', fields: ['id', 'task_id', 'project_id', 'minutes', 'day', 'note', 'created_at'], why: 'time the person logged' },
  projectStatusUpdates: { class: 'export', scope: 'own', fields: ['id', 'project_id', 'status', 'body', 'created_at'], why: 'status updates the person wrote' },
  projectMessages: { class: 'export', scope: 'own', fields: ['id', 'project_id', 'title', 'body', 'created_at'], why: 'board messages the person wrote' },
  goals: { class: 'export', scope: 'own', fields: ['id', 'title', 'description', 'status', 'progress', 'due_on', 'created_at', 'updated_at'], why: 'goals the person owns' },
  portfolios: { class: 'export', scope: 'own', fields: ['id', 'name', 'description', 'created_at', 'updated_at'], why: 'portfolios the person owns' },

  // Secrets: never exported, never copied.
  account: { class: 'secret', why: 'sign-in accounts and their tokens' },
  session: { class: 'secret', why: 'sessions' },
  passkey: { class: 'secret', why: 'passkey credentials' },
  twoFactor: { class: 'secret', why: 'two-factor secrets and backup codes' },
  verification: { class: 'secret', why: 'verification tokens' },
  apiKeys: { class: 'secret', why: 'API key hashes' },
  apiKeyBoards: { class: 'secret', why: 'API key scopes' },
  apiKeyBoardScopes: { class: 'secret', why: 'API key scopes' },
  apiKeyWorkspaces: { class: 'secret', why: 'API key scopes' },
  apiKeySecrets: { class: 'secret', why: 'API key secret history' },
  pairingCodes: { class: 'secret', why: 'pairing codes' },
  pairingDeviceRequests: { class: 'secret', why: 'device codes' },
  customerInvitations: { class: 'secret', why: 'invitation token hashes' },
  teamInvitations: { class: 'secret', why: 'invitation token hashes' },
  projectGuestInvitations: { class: 'secret', why: 'invitation token hashes' },
  pushSubscriptions: { class: 'secret', why: 'push endpoints and keys' },
  instanceSettings: { class: 'secret', why: 'instance-wide keys and settings' },
  projectSecrets: { class: 'secret', why: 'board secrets (encrypted)' },

  // Other people's rows, or board data that is not the person's to take.
  notifications: { class: 'other', why: 'notifications about the person (generated, not written by them)' },
  agentAudit: { class: 'other', why: 'agent activity on the person\'s keys' },
  aiUsageRecords: { class: 'other', why: 'usage records' },
  taskActivity: { class: 'other', why: 'the board\'s activity log' },
  taskDependencies: { class: 'other', why: 'board data' },
  taskFieldValues: { class: 'other', why: 'board data' },
  projectColumns: { class: 'other', why: 'board data' },
  projectFields: { class: 'other', why: 'board data' },
  projectWatchers: { class: 'other', why: 'who watches a board' },
  projectRules: { class: 'other', why: 'board rules' },
  projectRuleRuns: { class: 'other', why: 'board rule runs' },
  projectSecretEvents: { class: 'other', why: 'board secret events' },
  projectGithubAudit: { class: 'other', why: 'board GitHub audit' },
  projectGithubRepos: { class: 'other', why: 'board GitHub links' },
  projectGithubSettings: { class: 'other', why: 'board GitHub settings' },
  githubLinks: { class: 'other', why: 'board GitHub links' },
  boardImports: { class: 'other', why: 'board imports' },
  goalProjects: { class: 'other', why: 'links of goals to boards' },
  portfolioProjects: { class: 'other', why: 'links of portfolios to boards' },
  teamRules: { class: 'other', why: 'team rules' },
  teamRuleRuns: { class: 'other', why: 'team rule runs' },
  teamSettings: { class: 'other', why: 'team settings' },
  customers: { class: 'other', why: 'customers of a team' },
  customerMembers: { class: 'other', why: 'customer contacts' },
  invitation: { class: 'other', why: 'invitations to a team' },
  crews: { class: 'other', why: 'crews (agents) of a team' },
  crewBoards: { class: 'other', why: 'crew links' },
  crewBoardMembers: { class: 'other', why: 'crew members' },
  crewMail: { class: 'other', why: 'crew mail' },
  crewApiAudit: { class: 'other', why: 'crew API audit' },

  // Infrastructure.
  timeTimers: { class: 'system', why: 'a running timer (live state)' },
  rateLimitHits: { class: 'system', why: 'rate limits' },
  githubCache: { class: 'system', why: 'GitHub response cache' },
  githubDeliveries: { class: 'system', why: 'GitHub webhook deliveries' },
  githubDeliveryFailures: { class: 'system', why: 'GitHub webhook failures' },
  crewApiGate: { class: 'system', why: 'crew API gate state' }
}
