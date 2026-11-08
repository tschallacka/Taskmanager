import { and, eq } from 'drizzle-orm'
import { db } from '../../../db'
import { projects, user } from '../../../db/schema'
import { authenticateApiKey, forCall, hasScope } from '../../../utils/api-keys'
import type { ApiKeyContext } from '../../../utils/api-keys'
import type { Audience } from '../../../utils/auth-helpers'
import { isBoardAdmin } from '../../../utils/boardAdmin'
import { audienceOf, boardFilter } from '../../../utils/mcpAccess'
import { requireProject } from '../../../utils/projects'
import {
  BACKUPS_PER_HOUR, backupChecksum, backupFileName, backupSlotKey, backupWaitSeconds, claimBackupSlot,
  parseList, recordBackupDownload, releaseBackupSlot, streamBoardBackup
} from '../../../utils/boardBackup'
import type { BackupRequest } from '../../../utils/boardBackup'

// GET /api/projects/:id/backup: the board as one JSON file (format "taskmanager-board-backup", version 1,
// see shared/backup/schema.ts). Anyone who can read the board may download it; the file holds what that
// caller can see, decided by the same audience the board routes use. Someone with no access gets the same
// 404 as the board route. A crew key reads like a customer's contact.
//
// The ETag is the file's checksum. A caller who sends the same ETag back in If-None-Match gets 304 and no
// body, and that does not count against the hourly limit. Each board takes one download at a time per
// caller, and each caller may download a board BACKUPS_PER_HOUR times an hour; instance admins are exempt.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const query = getQuery(event)

  let only: string[] | null
  let columns: string[] | null
  try {
    only = parseList(query.only)
    columns = parseList(query.columns, 500)
  } catch {
    throw createError({ statusCode: 400, message: 'The list of cards or columns is too long' })
  }

  const caller = await backupCaller(event, id)
  const request: BackupRequest = {
    project: caller.project,
    viewerId: caller.viewerId,
    callerId: caller.callerId,
    keyId: caller.keyId,
    keyName: caller.keyName,
    audience: caller.audience,
    admin: caller.admin,
    only,
    columns,
    inlineAttachments: query.attachments === 'inline',
    instance: getRequestHost(event)
  }

  const slot = backupSlotKey(id, caller.callerId)
  if (!claimBackupSlot(slot)) {
    throw createError({ statusCode: 409, message: 'A backup of this board is already being made for you. Try again when it has finished.' })
  }

  try {
    const checksum = await backupChecksum(request)
    setResponseHeader(event, 'ETag', `"${checksum}"`)
    setResponseHeader(event, 'Cache-Control', 'private, no-cache')

    if (etagMatches(getRequestHeader(event, 'if-none-match'), checksum)) {
      releaseBackupSlot(slot)
      setResponseStatus(event, 304)
      return ''
    }

    if (!caller.instanceAdmin) {
      const wait = backupWaitSeconds(caller.callerId, id)
      if (wait > 0) {
        releaseBackupSlot(slot)
        setResponseHeader(event, 'Retry-After', wait)
        throw createError({
          statusCode: 429,
          message: `This board has been downloaded ${BACKUPS_PER_HOUR} times in the last hour. Try again in ${wait} seconds.`
        })
      }
      recordBackupDownload(caller.callerId, id)
    }
  } catch (error) {
    releaseBackupSlot(slot)
    throw error
  }

  // The slot is held until the stream has been written or cancelled.
  setResponseHeader(event, 'Content-Type', 'application/json')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="${backupFileName(caller.project.name, new Date())}"`)
  return streamBoardBackup(request)
})

interface Caller {
  project: BackupRequest['project']
  viewerId: string
  callerId: string
  keyId: string | null
  keyName: string
  audience: Audience
  /** A board admin (see boardAdmin.ts). Only an admin's staff file holds the sensitive material. */
  admin: boolean
  instanceAdmin: boolean
}

/** Who is asking and what they may read: a browser session, or an API key with read access to the board. */
async function backupCaller(event: Parameters<typeof requireProject>[0], projectId: string): Promise<Caller> {
  const header = getHeader(event, 'authorization') ?? ''
  if (!/^Bearer\s/i.test(header)) {
    const project = await requireProject(event, projectId)
    const userId = event.context.session.user.id
    const [me] = await db.select({ isInstanceAdmin: user.isInstanceAdmin }).from(user).where(eq(user.id, userId))
    return {
      project,
      viewerId: userId,
      callerId: userId,
      keyId: null,
      keyName: 'Board settings',
      audience: project.audience,
      admin: await isBoardAdmin(userId, project),
      instanceAdmin: !!me?.isInstanceAdmin
    }
  }

  // A backup is a read: a token with per-board grants reaches the boards that grant it the read permission.
  const context: ApiKeyContext = forCall(await authenticateApiKey(event), 'boards:read')
  if (!hasScope(context, 'boards:read')) {
    throw createError({ statusCode: 403, message: 'This key cannot read boards, so it cannot download a backup.' })
  }
  const [owner] = await db.select({ crewId: user.crewId, isInstanceAdmin: user.isInstanceAdmin }).from(user).where(eq(user.id, context.userId))
  const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), await boardFilter(context)))
  if (!project) throw createError({ statusCode: 404, message: 'Project not found' })

  // A crew key reads like a customer's contact: the crew's internal notes stay inside the crew.
  const audience: Audience = owner?.crewId ? 'customer' : audienceOf(context, project)
  return {
    project,
    viewerId: context.userId,
    callerId: context.keyId,
    keyId: context.keyId,
    keyName: context.keyName,
    audience,
    // A crew key is never an admin here: its audience is the customer view, and the admin flag only counts on a staff read.
    admin: !owner?.crewId && audience === 'staff' && await isBoardAdmin(context.userId, project),
    instanceAdmin: !!owner?.isInstanceAdmin
  }
}

/** True when If-None-Match names this checksum, as a strong or a weak tag, or as `*`. */
function etagMatches(header: string | undefined, checksum: string): boolean {
  if (!header) return false
  if (header.trim() === '*') return true
  return header.split(',').some(tag => tag.trim().replace(/^W\//, '').replace(/^"|"$/g, '') === checksum)
}
