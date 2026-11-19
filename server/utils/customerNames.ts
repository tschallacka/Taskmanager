// The customer name a project shows to a person. Staff see the name of the project's customer. A contact sees only the name
// of their own customer on that project, or nothing: never another customer's name (Boss's ruling). Pure.

import type { ProjectAudience } from '#shared/utils/projectAudience'

export function customerNameForAudience(input: { audience: ProjectAudience, staffName: string | null, ownName: string | null | undefined }): string | null {
  if (input.audience === 'staff') return input.staffName
  return input.ownName ?? null
}

/** The viewer's own customer name per project, from the pairs of their customers' shared projects. The first pair wins. */
export function ownCustomerNameMap(pairs: { projectId: string, customerName: string }[]): Map<string, string> {
  const names = new Map<string, string>()
  for (const pair of pairs) {
    if (!names.has(pair.projectId)) names.set(pair.projectId, pair.customerName)
  }
  return names
}
