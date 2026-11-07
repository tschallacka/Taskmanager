#!/usr/bin/env node
// Prints the current six-digit authenticator code (TOTP, RFC 6238: SHA-1, 30 seconds), the code an
// authenticator app shows for the same secret. For testers who switch two-factor on in a dev copy.
//
//   node crew/totp.mjs <file>        or  crew totp <file>
//
// <file> holds either the whole otpauth://totp/... link the app shows under the QR code, or just the
// value of its secret= part (base32). The secret is read from the file, so it never appears on a
// command line, in a log or in chat. Keep the file in your own work folder, and never put the secret
// in a card, an update, a commit or chat. Dev copies and scratch accounts only.
//
// The code is valid for the seconds printed after it. With fewer than 5 left, wait and run it again.
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

// The key bytes for the text of a secret file, or null when the text holds no valid base32 secret.
export function keyOf(text) {
  let raw = String(text).trim()
  if (raw.startsWith('otpauth://')) {
    let link
    try {
      link = new URL(raw)
    } catch {
      return null
    }
    raw = link.searchParams.get('secret') ?? ''
  }
  const base32 = raw.replace(/[\s=-]/g, '').toUpperCase()
  if (!base32 || [...base32].some(ch => ALPHABET.indexOf(ch) < 0)) return null
  const bits = [...base32].map(ch => ALPHABET.indexOf(ch).toString(2).padStart(5, '0')).join('')
  const bytes = (bits.match(/.{8}/g) ?? []).map(byte => parseInt(byte, 2))
  return bytes.length ? Buffer.from(bytes) : null
}

// The code for a key at a moment (seconds since the epoch): six digits, or fewer digits padded with zeros.
export function codeAt(key, seconds, period = 30, digits = 6) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(seconds / period)))
  const mac = createHmac('sha1', key).update(counter).digest()
  const offset = mac[mac.length - 1] & 0x0f
  const value = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits
  return String(value).padStart(digits, '0')
}

export function secondsLeft(seconds, period = 30) {
  return period - (seconds % period)
}

function main() {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: node crew/totp.mjs <file with the otpauth link or its base32 secret>')
    process.exit(64)
  }
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    console.error(`cannot read ${file}`)
    process.exit(66)
  }
  const key = keyOf(text)
  if (!key) {
    console.error('the secret is not base32; copy the secret= part of the otpauth link, or the whole link')
    process.exit(65)
  }
  const now = Math.floor(Date.now() / 1000)
  console.log(`${codeAt(key, now)} (valid ${secondsLeft(now)} more seconds)`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
