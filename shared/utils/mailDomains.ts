// Public mail providers. A project admin can whitelist a company's domain for a manager guest, but
// never one of these: that would hand a manager guest blanket invites to anyone with an account there.
const PUBLIC_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'ymail.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.net', 'gmx.de',
  'mail.com', 'zoho.com', 'yandex.com', 'web.de', 't-online.de', 'hotmail.nl', 'live.nl', 'ziggo.nl', 'kpnmail.nl',
  'planet.nl', 'xs4all.nl', 'hetnet.nl', 'home.nl', 'orange.fr', 'free.fr', 'wanadoo.fr', 'qq.com', '163.com'
])

export function isPublicMailDomain(domain: string): boolean {
  return PUBLIC_MAIL_DOMAINS.has(domain.trim().toLowerCase())
}
