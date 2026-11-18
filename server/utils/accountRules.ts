// What deleting an account does to each column that holds the person's user id (card mwjfpokj5rvl92bserd, approved plan).
// Each column is one of:
//   delete     the row goes
//   tombstone  the row stays; its user id moves to the 'deleted-user' row, which shows as "Deleted user"
//   null       the column is cleared; the row stays (nullable columns only)
//   by-scope   a team's board, goal or portfolio: tombstone (the team keeps it); a personal one: delete
// tests/account-deletion-coverage.test.ts reads the schema and fails for any column without a rule here.

export const DELETED_USER_ID = 'deleted-user'

// 'delete-by-key': the column holds a crew person's key, not a user id: the rows whose key is the person's go.
export type AccountRule = 'delete' | 'tombstone' | 'null' | 'by-scope' | 'delete-by-key'

export const ACCOUNT_RULES = {
  // Sign-in material and the person's own settings: deleted.
  'session.user_id': 'delete',
  'account.user_id': 'delete',
  'passkey.user_id': 'delete',
  'two_factor.user_id': 'delete',
  'user_email.user_id': 'delete',
  'api_keys.user_id': 'delete',
  'board_pins.user_id': 'delete',
  'notification_preferences.user_id': 'delete',
  'user_settings.user_id': 'delete',
  'push_subscriptions.user_id': 'delete',
  'time_timers.user_id': 'delete',
  'notifications.user_id': 'delete',
  'ai_usage_records.user_id': 'delete',
  'pairing_codes.created_by': 'delete',
  // Memberships and access: deleted (the owner rule runs first).
  'member.user_id': 'delete',
  'customer_members.user_id': 'delete',
  'project_members.user_id': 'delete',
  'project_guests.user_id': 'delete',
  'project_watchers.user_id': 'delete',
  'crew_board_members.user_id': 'delete',
  // Boards, goals and portfolios: by whether they belong to a team.
  'projects.user_id': 'by-scope',
  'goals.user_id': 'by-scope',
  'portfolios.user_id': 'by-scope',
  // What the person wrote for the team: the text stays, the name goes.
  'project_status_updates.user_id': 'tombstone',
  'project_messages.user_id': 'tombstone',
  'task_comments.user_id': 'tombstone',
  'time_entries.user_id': 'tombstone',
  'agent_audit.user_id': 'tombstone',
  // Records that name the person as someone who acted: cleared, the record stays.
  'instance_settings.updated_by': 'null',
  'invitation.inviter_id': 'delete',
  'customer_invitations.created_by': 'null',
  'customer_invitations.accepted_by': 'null',
  'project_columns.deleted_by': 'null',
  'project_tasks.assignee_id': 'null',
  'project_tasks.created_by': 'null',
  'project_tasks.deleted_by': 'null',
  'task_activity.actor_id': 'null',
  'notifications.actor_id': 'null',
  'goals.owner_id': 'null',
  'project_secret_events.user_id': 'null',
  'project_github_audit.user_id': 'null',
  'github_links.created_by': 'null',
  'project_rules.created_by': 'null',
  'team_rules.created_by': 'null',
  'project_members.added_by': 'null',
  'project_guests.added_by': 'null',
  'project_guest_invitations.invited_by': 'null',
  'project_guest_invitations.decided_by': 'null',
  'project_guest_invitations.accepted_by': 'null',
  'team_invitations.invited_by': 'null',
  'team_invitations.accepted_by': 'null',
  'project_secrets.created_by': 'null',
  'project_secrets.updated_by': 'null',
  'crews.created_by': 'null',
  'crew_boards.created_by': 'null',
  'crew_api_gate.opened_by': 'null',
  'task_dependencies.created_by': 'null',
  'pairing_device_requests.approved_by': 'null',
  'api_key_secrets.actor_id': 'null',
  'github_delivery_failures.handled_by': 'null',
  // A crew account's correspondence: its rows go with the person (see deleteCrewMailFor).
  'crew_mail.from_key': 'delete-by-key',
  'crew_mail.to_key': 'delete-by-key'
} as const satisfies Record<string, AccountRule>

// Columns that hold a person's name with no foreign key to the user table. They are part of the same coverage.
export const NAMED_PERSON_COLUMNS = [
  'api_key_secrets.actor_id',
  'github_delivery_failures.handled_by'
] as const

// What the account download (Art. 20, card mwjfpr8phz5gi4bdjqa) takes from each table that holds a person's id. One
// decision per table, under the same walk the deletion uses (tests/account-deletion-coverage.test.ts):
//   export  the rows whose `by` column is the person; only the listed fields leave the server (an allow-list)
//   not     nothing from this table: a secret, another person's data, or not part of the download, with the reason
// A new table with a person id fails the coverage test until it has a decision here.
export type ExportRule = { kind: 'export', by: string, fields: string[], why: string } | { kind: 'not', why: string }

/** A column name that must never be exported (keys, hashes, tokens, passwords, codes, sessions). */
export const EXPORT_SECRET_COLUMN = /hash|token|secret|password|passkey|key|prefix|salt|otp|code|session|credential/i

export const EXPORT_RULES: Record<string, ExportRule> = {
  // The person's own rows.
  user_email: { kind: 'export', by: 'user_id', fields: ['email', 'verified_at'], why: 'extra addresses the person added' },
  user_settings: { kind: 'export', by: 'user_id', fields: ['primary_color', 'neutral_color'], why: 'personal colours; AI keys and model choices are not exported' },
  notification_preferences: { kind: 'export', by: 'user_id', fields: ['email', 'browser'], why: 'the person\'s notification choices' },
  // Memberships: the person's own membership rows, nothing about other members.
  member: { kind: 'export', by: 'user_id', fields: ['organization_id', 'role', 'created_at'], why: 'team memberships (the team name is joined in the export)' },
  project_members: { kind: 'export', by: 'user_id', fields: ['project_id', 'role', 'created_at'], why: 'board memberships (the board name is joined in the export)' },
  project_guests: { kind: 'export', by: 'user_id', fields: ['project_id', 'role', 'created_at'], why: 'guest access to boards (the board name is joined in the export)' },
  projects: { kind: 'export', by: 'user_id', fields: ['id', 'name', 'created_at'], why: 'boards the person owns: name and date only' },
  // What the person wrote.
  project_tasks: { kind: 'export', by: 'created_by', fields: ['id', 'project_id', 'title', 'description', 'created_at', 'updated_at'], why: 'tasks the person created' },
  task_comments: { kind: 'export', by: 'user_id', fields: ['id', 'task_id', 'body', 'created_at', 'edited_at'], why: 'comments the person wrote' },
  time_entries: { kind: 'export', by: 'user_id', fields: ['id', 'task_id', 'project_id', 'minutes', 'day', 'note', 'created_at'], why: 'time the person logged' },
  project_status_updates: { kind: 'export', by: 'user_id', fields: ['id', 'project_id', 'status', 'body', 'created_at'], why: 'status updates the person wrote' },
  // Secrets: never exported.
  account: { kind: 'not', why: 'sign-in accounts and their tokens: secret' },
  session: { kind: 'not', why: 'sign-in sessions: secret' },
  passkey: { kind: 'not', why: 'passkeys: secret' },
  two_factor: { kind: 'not', why: 'two-factor secret and backup codes: secret' },
  api_keys: { kind: 'not', why: 'API keys: secret (only the hash is stored)' },
  api_key_secrets: { kind: 'not', why: 'API key secret history: secret' },
  pairing_codes: { kind: 'not', why: 'pairing codes: secret' },
  pairing_device_requests: { kind: 'not', why: 'device codes: secret' },
  customer_invitations: { kind: 'not', why: 'invitation tokens: secret' },
  team_invitations: { kind: 'not', why: 'invitation tokens: secret; invitations the person sent are not the person\'s data' },
  project_guest_invitations: { kind: 'not', why: 'invitation tokens: secret' },
  push_subscriptions: { kind: 'not', why: 'push endpoints and keys: secret' },
  project_secrets: { kind: 'not', why: 'board secrets: secret' },
  project_secret_events: { kind: 'not', why: 'board secret history: other people\'s actions on secrets' },
  // Another person's data, or the system's.
  invitation: { kind: 'not', why: 'invitations the person sent: another person\'s data' },
  crews: { kind: 'not', why: 'crew infrastructure: not the person\'s data' },
  crew_boards: { kind: 'not', why: 'crew infrastructure: not the person\'s data' },
  crew_board_members: { kind: 'not', why: 'crew infrastructure: not the person\'s data' },
  crew_api_gate: { kind: 'not', why: 'crew gate state: system' },
  github_links: { kind: 'not', why: 'board links to GitHub: the board\'s data, not the person\'s' },
  github_delivery_failures: { kind: 'not', why: 'webhook failures: system' },
  project_github_audit: { kind: 'not', why: 'board GitHub audit: other people\'s actions' },
  instance_settings: { kind: 'not', why: 'instance settings: the owner\'s, not the person\'s' },
  customer_members: { kind: 'not', why: 'customer portal membership: not part of this download' },
  goals: { kind: 'not', why: 'goals: not part of this download' },
  portfolios: { kind: 'not', why: 'portfolios: not part of this download' },
  project_messages: { kind: 'not', why: 'board chat messages: not part of this download' },
  project_columns: { kind: 'not', why: 'board columns: the board\'s structure, not the person\'s' },
  project_rules: { kind: 'not', why: 'board automation rules: the board\'s, not the person\'s' },
  team_rules: { kind: 'not', why: 'team automation rules: the team\'s, not the person\'s' },
  task_dependencies: { kind: 'not', why: 'links between tasks: not part of this download' },
  task_activity: { kind: 'not', why: 'activity log: other people\'s actions too' },
  notifications: { kind: 'not', why: 'the notification inbox: transient, not part of this download' },
  board_pins: { kind: 'not', why: 'sidebar pins: a view setting, not part of this download' },
  project_watchers: { kind: 'not', why: 'watch list: not part of this download' },
  agent_audit: { kind: 'not', why: 'security audit of agent actions: kept for the audit, not exported' },
  ai_usage_records: { kind: 'not', why: 'AI usage counts: not part of this download' },
  time_timers: { kind: 'not', why: 'a running timer: not part of this download' }
}
