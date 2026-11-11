import { auditRefusal, checkCrewKey, closeWindow, expireWindowIfDue, readGate, remoteManagementVerdict, windowIsOpen } from '../utils/crewGate'
import { auditPeer, bucketOf, decide, isCrewApiPath, isLocalRequest, limitedStatus, noteDenial, NO_LIVE_CREW_SENTENCE, overDenialLimit, peerOf, rateKey, trustSocket } from '../utils/crewGatePolicy'
import { chargeRateLimit, limitsFor, requestAddress, scopeOfBoard } from '../utils/rateLimits'

// Every call on /api/crews and /api/crews/* passes here first (BRIEF-crew-feature 2b).
// A remote caller, or any caller while the window is shut and it is not local, gets a plain
// 404 that gives nothing away. Everything else must present a crews:manage key. The one remote
// keys that pass are a live management token (kind 'management', bound to one board), and the permanent
// unbound key of a crew owner (its own crews only, see remoteCrewOwnerVerdict); the
// instance admin's unbound key stays local-only.
// Refused calls are counted per caller in its own bucket (local or remote), see crewGatePolicy.
export default defineEventHandler(async (event) => {
  if (!isCrewApiPath(event.path)) return

  const now = Date.now()
  const peer = peerOf(event)
  const local = isLocalRequest(peer, event.headers, trustSocket())
  const bucket = bucketOf(local)
  const key = rateKey(local, peer, event.headers)
  const from = auditPeer(peer, event.headers)
  const keyPresented = event.headers.has('authorization')

  // Over the limit of its own bucket: a local caller gets 429, a remote one the plain 404 and
  // nothing is counted or audited for it.
  if (overDenialLimit(bucket, key, now)) {
    const status = limitedStatus(local)
    throw createError({ statusCode: status, statusMessage: status === 429 ? 'Too Many Requests' : 'Not Found' })
  }

  // The window row comes from a cache of at most two seconds, so a flood of calls does not
  // read the database each time.
  const gate = await expireWindowIfDue(await readGate(), now)
  const windowOpen = windowIsOpen(gate, now)

  // A remote call takes its verdict from its management token or its owner's crews:manage key; while the window is
  // open, any other key is checked the way the window always checked it.
  const verdict = local
    ? await checkCrewKey(event)
    : (await remoteManagementVerdict(event)) ?? (windowOpen ? await checkCrewKey(event) : null)
  // A crews:manage key whose owner has no live crew of their own is told so in one sentence, not with the plain 404.
  if (!local && !windowOpen && verdict && !verdict.ok && verdict.noCrew) {
    noteDenial(bucket, key, now)
    await auditRefusal({ from, method: event.method, path: event.path, outcome: 'no live crew', keyPresented, now }, false)
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: NO_LIVE_CREW_SENTENCE })
  }
  const step = decide({ local, windowOpen, tempKeyId: gate.tempKeyId, verdict })
  if (step.pass) {
    // A remote management token is charged per token and per address, with the limits of its board, like the other agent calls.
    if (!local && verdict?.ok && verdict.management) {
      const limits = await limitsFor('tasks', await scopeOfBoard(verdict.boardId))
      await chargeRateLimit('tasks', `management-token:${verdict.keyId}`, limits, event)
      await chargeRateLimit('tasks', `management-address:${requestAddress(event)}`, limits, event)
    }
    return
  }

  noteDenial(bucket, key, now)
  // A refusal that closes the window is written now, before the window closes and the caller is answered.
  await auditRefusal({ from, method: event.method, path: event.path, outcome: step.outcome, keyPresented, now }, Boolean(step.closeReason))
  if (step.closeReason) await closeWindow(step.closeReason, from, now)

  if (step.status === 404) throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  // A refused token answers its own sentence (regenerated, revoked, expired), so the agent passes it on.
  const message = verdict && !verdict.ok && verdict.message ? verdict.message : 'Invalid or missing API key'
  throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message })
})
