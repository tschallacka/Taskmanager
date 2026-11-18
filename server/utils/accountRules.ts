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
