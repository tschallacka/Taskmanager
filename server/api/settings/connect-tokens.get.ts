import { listConnectTokens } from '../../utils/connectTokenWindow'

/**
 * The caller's connect tokens for the "Connect your Claude" window: each with the boards it reaches and what it
 * may do on each, its expiry, its last use and who paired it last. Team keys are not listed here. Also the boards
 * the caller may pick from, and whether they may give a token the crew permission.
 */
export default defineEventHandler(event => listConnectTokens(event.context.session.user.id))
