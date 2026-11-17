// The customer name a project shows to a person. Staff see the name of the project's customer. A contact sees only the name
// of their own customer on that project, or nothing: never another customer's name (Boss's ruling). Pure.

export type Audience = 'staff' | 'customer'

export function customerNameForAudience(input: { audience: Audience, staffName: string | null, ownName: string | null | undefined }): string | null {
  if (input.audience === 'staff') return input.staffName
  return input.ownName ?? null
}
