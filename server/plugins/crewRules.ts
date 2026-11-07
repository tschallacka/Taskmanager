import { sweepTestClock } from '../utils/crewRules'
import { inMaintenance } from '../utils/maintenance'

// The failing-test clock is a timer only: once on boot, then every 5 minutes. The rules live in
// utils/crewRules.ts so a script can run the same sweep. The clock notes at 15 and 45 minutes, so a
// five-minute tick keeps each note within a few minutes of its time.
const INTERVAL_MS = 5 * 60 * 1000

export default defineNitroPlugin(() => {
  // A slow sweep is not started again by the next tick.
  let inFlight = false
  const run = async () => {
    // The sweep writes to the database, which a deploy may be changing under us.
    if (inFlight || inMaintenance()) return
    inFlight = true
    try {
      const sent = await sweepTestClock()
      if (sent) console.log(`[rules] failing-test clock sent ${sent} note(s)`)
    } catch (error) {
      // A failed sweep is retried on the next tick; the card is still waiting then.
      console.error('[rules] failing-test clock failed', error)
    } finally {
      inFlight = false
    }
  }

  void run()
  const timer = setInterval(run, INTERVAL_MS)
  // The interval must not be what keeps the process alive on shutdown.
  timer.unref?.()
})
