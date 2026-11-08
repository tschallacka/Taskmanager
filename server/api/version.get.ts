import { versionInfo } from '../utils/appVersion'

// The version of this instance: no session and no database, like /api/health. It is public because
// requireAuth only guards the prefixes it lists, and this path is not one of them.
export default defineEventHandler(() => versionInfo())
