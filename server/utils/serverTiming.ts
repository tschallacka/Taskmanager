// The Server-Timing header (Speed, card mwibpggpqn4ml5tmntg): each measured stage of a request, in milliseconds, so a browser
// shows where the time went. A stage with no time is left out; no stages give an empty header.
export function serverTimingHeader(stages: Record<string, number | undefined>): string {
  return Object.entries(stages)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
    .map(([name, ms]) => `${name};dur=${ms.toFixed(1)}`)
    .join(', ')
}
