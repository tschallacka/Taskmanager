// Which projects a customer is given when the team files them (the Share dialog and the customer invite route).

/**
 * The projects a customer is given by its ticks: each ticked project of the team, once, in the order ticked. A project
 * already shared with another customer is shared with this one too (the customer_projects join table, part 2).
 */
export function sharePlan(ticked: string[], teamProjectIds: string[]): string[] {
  const team = new Set(teamProjectIds)
  return [...new Set(ticked)].filter(id => team.has(id))
}
