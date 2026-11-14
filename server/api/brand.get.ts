import { brandPublic } from '../utils/brand'

// The app name and logo of this instance. Public: the login page shows them before anyone signs in. Carries no
// setting other than the name and the logo.
export default defineEventHandler(async () => {
  return brandPublic()
})
