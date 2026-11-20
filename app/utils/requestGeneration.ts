// A generation counter for requests whose answer belongs to one team (Speed, card mwibpggp). A request takes a token when it starts,
// and applies its answer only while the token is still current. bump() is a team switch: every token taken before it goes stale,
// so the old team's rows are dropped when they arrive.
export function createGeneration() {
  let current = 0
  return {
    begin() {
      const mine = current
      return { isCurrent: () => mine === current }
    },
    bump() {
      current += 1
    }
  }
}
