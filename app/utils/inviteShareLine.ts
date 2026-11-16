// The line on the invite page about what is shared. A person who is not signed in is not told that nothing is
// shared: the page cannot know which account would see what.

export function shareLine(input: { count: number, signedIn: boolean, organizationName: string }): string | null {
  if (input.count > 0) return null
  if (!input.signedIn) return 'Accept to see what is shared with you.'
  return `Nothing is shared with you yet by ${input.organizationName}. Their projects show here as soon as they share one.`
}
