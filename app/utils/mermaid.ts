// Mermaid is a large library and most tasks never draw a diagram, so it is
// loaded on first use. Rendering runs in strict mode: the diagram text can
// come from an agent over MCP, and strict mode keeps HTML labels and click
// handlers out of the SVG it produces.
//
// The diagrams are drawn in the app's own palette rather than Mermaid's
// purple: zinc surfaces and ink, and the user's accent colour for the primary
// fill, in both modes. Mermaid does its own colour maths on these values, so
// they must be plain hex; the accent's shades are mixed from its base hex.

import type { MermaidConfig } from 'mermaid'
import { colorHex } from '#shared/utils/colors'

type MermaidModule = typeof import('mermaid').default

let loading: Promise<MermaidModule> | null = null
let configuredKey: string | null = null
let counter = 0

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'

interface Shades {
  s50: string
  s100: string
  s200: string
  s300: string
  s400: string
  s500: string
  s600: string
  ink: string
  d800: string
  d900: string
  onDark: string
}

function channels(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** `share` of `other` mixed into `hex`, as a hex colour. */
function mix(hex: string, other: string, share: number): string {
  const a = channels(hex)
  const b = channels(other)
  return '#' + a.map((c, i) => Math.round(c + (b[i]! - c) * share).toString(16).padStart(2, '0')).join('')
}

export function accentShades(accent: string): Shades {
  const base = colorHex(accent)
  const white = '#ffffff'
  const black = '#000000'
  return {
    s50: mix(base, white, 0.92),
    s100: mix(base, white, 0.82),
    s200: mix(base, white, 0.64),
    s300: mix(base, white, 0.45),
    s400: mix(base, white, 0.25),
    s500: base,
    s600: mix(base, black, 0.18),
    ink: mix(base, black, 0.8),
    d800: mix(base, black, 0.5),
    d900: mix(base, black, 0.65),
    onDark: mix(base, white, 0.94)
  }
}

const light = (a: Shades) => ({
  background: '#ffffff',
  primaryColor: a.s50,
  primaryTextColor: '#18181b',
  primaryBorderColor: a.s400,
  secondaryColor: '#f4f4f5',
  secondaryTextColor: '#18181b',
  secondaryBorderColor: '#d4d4d8',
  tertiaryColor: '#fafafa',
  tertiaryTextColor: '#3f3f46',
  tertiaryBorderColor: '#e4e4e7',
  lineColor: '#71717a',
  textColor: '#3f3f46',
  mainBkg: a.s50,
  nodeBorder: a.s400,
  clusterBkg: '#fafafa',
  clusterBorder: '#d4d4d8',
  edgeLabelBackground: '#f4f4f5',
  titleColor: '#18181b',
  noteBkgColor: '#fef9c3',
  noteTextColor: '#713f12',
  noteBorderColor: '#fde047',
  actorBkg: a.s50,
  actorBorder: a.s400,
  actorTextColor: '#18181b',
  actorLineColor: '#a1a1aa',
  signalColor: '#3f3f46',
  signalTextColor: '#3f3f46',
  labelBoxBkgColor: '#f4f4f5',
  labelBoxBorderColor: '#d4d4d8',
  labelTextColor: '#18181b',
  loopTextColor: '#18181b',
  activationBkgColor: a.s100,
  activationBorderColor: a.s400,
  sectionBkgColor: '#f4f4f5',
  altSectionBkgColor: '#ffffff',
  sectionBkgColor2: a.s50,
  taskBkgColor: a.s400,
  taskBorderColor: a.s600,
  taskTextColor: a.ink,
  taskTextLightColor: a.ink,
  taskTextDarkColor: a.ink,
  activeTaskBkgColor: a.s200,
  activeTaskBorderColor: a.s600,
  doneTaskBkgColor: '#e4e4e7',
  doneTaskBorderColor: '#a1a1aa',
  gridColor: '#e4e4e7',
  todayLineColor: '#e34948',
  // Pie slices take the chart palette, so a Mermaid pie matches a chart block.
  pie1: '#2a78d6',
  pie2: '#eb6834',
  pie3: '#1baf7a',
  pie4: '#eda100',
  pie5: '#e87ba4',
  pie6: '#008300',
  pie7: '#4a3aa7',
  pie8: '#e34948',
  pieStrokeColor: '#ffffff',
  pieOuterStrokeColor: '#ffffff',
  pieStrokeWidth: '2px',
  pieOuterStrokeWidth: '0px',
  pieOpacity: '1',
  pieSectionTextColor: '#0b0b0b',
  pieSectionTextSize: '15px',
  pieTitleTextColor: '#18181b',
  pieLegendTextColor: '#3f3f46',
  fontFamily: FONT,
  fontSize: '14px'
})

const dark = (a: Shades) => ({
  darkMode: true,
  background: '#171717',
  primaryColor: a.d900,
  primaryTextColor: '#e4e4e7',
  primaryBorderColor: a.s500,
  secondaryColor: '#27272a',
  secondaryTextColor: '#e4e4e7',
  secondaryBorderColor: '#3f3f46',
  tertiaryColor: '#1f1f22',
  tertiaryTextColor: '#d4d4d8',
  tertiaryBorderColor: '#3f3f46',
  lineColor: '#a1a1aa',
  textColor: '#e4e4e7',
  mainBkg: a.d900,
  nodeBorder: a.s500,
  clusterBkg: '#1f1f22',
  clusterBorder: '#3f3f46',
  edgeLabelBackground: '#27272a',
  titleColor: '#fafafa',
  noteBkgColor: '#713f12',
  noteTextColor: '#fef9c3',
  noteBorderColor: '#a16207',
  actorBkg: a.d900,
  actorBorder: a.s500,
  actorTextColor: '#e4e4e7',
  actorLineColor: '#52525b',
  signalColor: '#d4d4d8',
  signalTextColor: '#d4d4d8',
  labelBoxBkgColor: '#27272a',
  labelBoxBorderColor: '#3f3f46',
  labelTextColor: '#e4e4e7',
  loopTextColor: '#e4e4e7',
  activationBkgColor: a.d800,
  activationBorderColor: a.s500,
  sectionBkgColor: '#27272a',
  altSectionBkgColor: '#171717',
  sectionBkgColor2: '#1f1f22',
  taskBkgColor: a.s600,
  taskBorderColor: a.s400,
  taskTextColor: a.onDark,
  taskTextLightColor: a.onDark,
  taskTextDarkColor: a.onDark,
  activeTaskBkgColor: a.s500,
  activeTaskBorderColor: a.s300,
  doneTaskBkgColor: '#3f3f46',
  doneTaskBorderColor: '#71717a',
  gridColor: '#3f3f46',
  todayLineColor: '#e66767',
  pie1: '#3987e5',
  pie2: '#d95926',
  pie3: '#199e70',
  pie4: '#c98500',
  pie5: '#d55181',
  pie6: '#008300',
  pie7: '#9085e9',
  pie8: '#e66767',
  pieStrokeColor: '#171717',
  pieOuterStrokeColor: '#171717',
  pieStrokeWidth: '2px',
  pieOuterStrokeWidth: '0px',
  pieOpacity: '1',
  pieSectionTextColor: '#0b0b0b',
  pieSectionTextSize: '15px',
  pieTitleTextColor: '#fafafa',
  pieLegendTextColor: '#e4e4e7',
  fontFamily: FONT,
  fontSize: '14px'
})

/** The Mermaid configuration for one colour mode and accent colour. */
export function mermaidConfig(isDark: boolean, accent = 'amber'): MermaidConfig {
  const shades = accentShades(accent)
  return {
    startOnLoad: false,
    securityLevel: 'strict' as const,
    theme: 'base' as const,
    themeVariables: isDark ? dark(shades) : light(shades),
    fontFamily: FONT,
    flowchart: { curve: 'basis', padding: 12, htmlLabels: false },
    sequence: { actorMargin: 40 },
    // Dates as "06 Sep" fit the column width; a diagram's own axisFormat still wins.
    gantt: { axisFormat: '%d %b', fontSize: 12 }
  }
}

async function load(): Promise<MermaidModule> {
  loading ??= import('mermaid').then(m => m.default)
  return loading
}

export async function renderMermaid(code: string, isDark: boolean, accent = 'amber'): Promise<string> {
  const mermaid = await load()
  const key = `${isDark ? 'dark' : 'light'}:${accent}`
  if (configuredKey !== key) {
    mermaid.initialize(mermaidConfig(isDark, accent))
    configuredKey = key
  }
  const id = `mermaid-${counter++}-${Date.now().toString(36)}`
  try {
    const { svg } = await mermaid.render(id, code)
    return svg
  } finally {
    // A failed parse can leave its scratch element behind in the body.
    document.getElementById(`d${id}`)?.remove()
  }
}

/** Mermaid's parse errors run to many lines of grammar; keep the useful ones. */
export function describeMermaidError(error: unknown): string {
  const message = (error as Error)?.message ?? ''
  const lines = message.split('\n').map(l => l.trim()).filter(Boolean)
  const where = lines.find(l => /^Parse error on line/i.test(l))
  const expecting = lines.find(l => /^Expecting/i.test(l))
  if (where && expecting) {
    // The list of every token the grammar would accept is noise; the token it
    // actually found is the useful half.
    const got = /got\s+(.+)$/i.exec(expecting)?.[1]
    return got ? `${where.replace(/:$/, '')} — unexpected ${got}.` : `${where} ${expecting.slice(0, 120)}`
  }
  return lines.slice(0, 2).join(' ').slice(0, 200) || 'Could not draw this diagram.'
}
