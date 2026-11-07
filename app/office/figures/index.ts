// The figure registry: the look of each crew key that has its own figure. A key with no entry here gets the
// placeholder look from meshes.ts (lookOf), so every member renders before its own figure is drawn. A role
// card adds its figure as app/office/figures/<key>.ts and lists it below.
import type { Look } from '../meshes'
import { look as janet } from './janet'
import { PAT } from './pat'
import { RITA_LOOK } from './rita'
import { TESS } from './tess'

export const FIGURES: Record<string, Look> = {
  janet,
  pat: PAT,
  rita: RITA_LOOK,
  tess: TESS
}
