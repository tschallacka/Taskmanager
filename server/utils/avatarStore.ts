// Where a profile picture lives on disk: one folder per person, one file, a random name. The serving route reads only a name
// this module accepts, so a request can never reach outside the person's folder.

import { join } from 'node:path'

export const AVATAR_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg'
}

const CONTENT_TYPE: Record<string, string> = Object.fromEntries(Object.entries(AVATAR_EXT).map(([type, ext]) => [ext, type]))

/** The folder that holds one person's picture. */
export function avatarDir(userId: string): string {
  return join(process.cwd(), 'data', 'avatars', userId)
}

/** A stored file name: 24 hex characters, a dot, and one of the known extensions. Anything else is refused. */
export function safeAvatarName(name: string): { ext: string } | null {
  const match = /^([a-f0-9]{24})\.(png|jpg|webp|svg)$/.exec(name)
  return match ? { ext: match[2]! } : null
}

/** The Content-Type a stored picture is served with. An SVG is served as an image, never as a page. */
export function contentTypeOf(ext: string): string {
  return CONTENT_TYPE[ext] ?? 'application/octet-stream'
}
