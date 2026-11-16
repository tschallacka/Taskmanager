// What the invite page does when the link was already used. The account that accepted it goes to its projects; any other
// visitor sees the message with a button: sign in when nobody is signed in, or go to the projects of the account signed
// in. Pure, so it is tested without the page.

export interface UsedInvitePlan {
  redirectTo: string | null
  button: { label: string, to: string } | null
}

export function usedInvitePlan(input: { signedIn: boolean, acceptedByYou: boolean }): UsedInvitePlan {
  if (input.acceptedByYou && input.signedIn) return { redirectTo: '/projects', button: null }
  if (input.signedIn) return { redirectTo: null, button: { label: 'Go to my projects', to: '/projects' } }
  return { redirectTo: null, button: { label: 'Sign in', to: '/login' } }
}
