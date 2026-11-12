import { join } from 'path'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs'
import type { MultiPartData } from 'h3'

// Image uploads for tasks follow one rulebook: the same formats, the same
// size cap, the same per-owner limit.
export const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'])

const EXT_FROM_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg'
}

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024 // 10 MB
export const MAX_ATTACHMENTS = 15

export const SAFE_ID = /^[a-z0-9]+$/i
export const SAFE_FILENAME = /^[a-z0-9]+\.[a-z0-9]+$/i

export const ATTACHMENT_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
}

/** Task files sit under data/task-attachments/<taskId>. */
export function taskAttachmentDir(taskId: string) {
  return join(process.cwd(), 'data', 'task-attachments', taskId)
}

export function countAttachments(dir: string) {
  return existsSync(dir) ? readdirSync(dir).length : 0
}

/**
 * Validates one multipart image and writes it to `dir` under a random name.
 * The extension comes from the validated MIME type, never from the client's
 * filename. Returns the stored filename.
 */
export function storeImageUpload(dir: string, filePart: MultiPartData | undefined) {
  if (!filePart?.data) throw createError({ statusCode: 400, message: 'No file provided' })

  const type = filePart.type ?? 'application/octet-stream'
  if (!ALLOWED_IMAGE_TYPES.has(type)) throw createError({ statusCode: 400, message: 'Unsupported file type' })
  if (filePart.data.length > MAX_ATTACHMENT_SIZE) throw createError({ statusCode: 400, message: 'File too large (max 10 MB)' })

  const ext = EXT_FROM_MIME[type]!
  const filename = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}.${ext}`

  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, filename), filePart.data)
  return filename
}

/**
 * Removes one uploaded file of a task and nothing else. The name must be a
 * plain stored name (no path parts); anything else, or a file that is not in
 * the folder, is refused. Returns false when there was no such file.
 */
export function deleteTaskAttachment(dir: string, filename: string): boolean {
  if (!SAFE_FILENAME.test(filename)) throw createError({ statusCode: 400, message: 'Not an attachment name' })
  const file = join(dir, filename)
  if (!existsSync(file)) return false
  rmSync(file, { force: true })
  return true
}

/** The wording when a task is full: how many there are, and how to free one. */
export function attachmentLimitMessage(count: number) {
  return `${count} of ${MAX_ATTACHMENTS} attachments: delete one first`
}

/** Drops every file a task uploaded. Called wherever the row is removed for good. */ Called wherever the row is removed for good. */
export function removeTaskAttachments(taskIds: string[]) {
  for (const id of taskIds) {
    const dir = taskAttachmentDir(id)
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
}
