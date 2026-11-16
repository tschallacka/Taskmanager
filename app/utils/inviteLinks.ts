// Where the invitation page's buttons go. The primary button opens the registration form; the plain link under it
// opens sign-in for someone who already has an account.

export interface InviteLinks {
  primary: string
  signIn: string
}

export function inviteLinks(token: string): InviteLinks {
  const invite = encodeURIComponent(token)
  return {
    primary: `/login?invite=${invite}&signup=1`,
    signIn: `/login?invite=${invite}&signin=1`
  }
}
