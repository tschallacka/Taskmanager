// The one-line crew update (see server/utils/crewUpdateScript.ts). A plain download, public like the kit itself.
export default defineEventHandler((event) => {
  const origin = getRequestURL(event).origin
  setResponseHeader(event, 'content-type', 'text/x-shellscript; charset=utf-8')
  return crewUpdateScript(origin)
})
