// Which form the login page opens in. An invitation opens in sign-up (the first-time person is the usual one);
// `signin=1` asks for sign-in instead, and it wins over `signup=1` when both are given. Without an invitation
// the page opens in sign-in, as it always has.

export type LoginMode = 'sign-in' | 'sign-up'

export interface LoginModeInput {
  invite: string | undefined
  signup: string | undefined
  signin: string | undefined
}

export function loginMode(input: LoginModeInput): LoginMode {
  if (!input.invite) return 'sign-in'
  return input.signin === '1' ? 'sign-in' : 'sign-up'
}
