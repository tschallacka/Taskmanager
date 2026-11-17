// The primary address of an account counts as proof of that address only once it is verified. Pure, so it is tested
// without a database.

export function primaryAddressOf(email: string | null | undefined, verified: boolean): string[] {
  return email && verified ? [email] : []
}
