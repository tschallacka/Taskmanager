// The text of "Delete my account" (card mwjfpokj5rvl92bserd): what the deletion does, in plain sentences, and the check
// that the typed address is the signed-in one. Pure, so the server route and the panel use the same rule.

/** What happens when the account is deleted, one sentence each. Shown before the confirmation. */
export function deletionLines(): string[] {
  return [
    'Your sign-in, sessions, passkeys, API keys and personal settings are removed, with your extra email addresses.',
    'A personal board with no other member is deleted with all its tasks and their attachment files.',
    'A team board stays for the team. Your comments and time entries keep their text and show "Deleted user".',
    'Tasks you created or filled in keep their text; the name you put on them is cleared.',
    'You must first hand over or delete any team you own: this is refused until you have.',
    'This cannot be undone.'
  ]
}

/** Whether the typed address is the signed-in one (case and surrounding spaces ignored). */
export function confirmMatches(typed: unknown, email: string): boolean {
  if (typeof typed !== 'string' || !email) return false
  return typed.trim().toLowerCase() === email.trim().toLowerCase()
}
