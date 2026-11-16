// The pages a signed-out visitor may open (the global auth middleware sends everyone else to /login). A path is public
// when it is one of these pages, or inside one of these folders. A longer name does not match by prefix: /privacyx is
// not /privacy. Pure.

const PUBLIC_PAGES = ['/login', '/privacy', '/imprint']
const PUBLIC_FOLDERS = ['/public', '/invite', '/confirm-email', '/privacy/archive', '/imprint/archive']

export function isPublicPagePath(path: string): boolean {
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path
  if (PUBLIC_PAGES.includes(clean)) return true
  return PUBLIC_FOLDERS.some(folder => clean === folder || clean.startsWith(`${folder}/`))
}
