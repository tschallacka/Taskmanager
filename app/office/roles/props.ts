// The props the role pieces bring, since the shared piece left them out. Tess's papers are a stack of sheets with a clip,
// held in the left hand. Not checked against a renderer here: CI runs the office tests with three.
import * as THREE from 'three'
import { box } from '../meshes'

/** Tess's papers: a stack of sheets with a clip. */
export function buildPapers(): THREE.Group {
  const g = new THREE.Group()
  g.add(box(0.26, 0.02, 0.34, '#f8f9fa', { y: 0 }))
  g.add(box(0.26, 0.02, 0.34, '#e9ecef', { y: 0.03 }))
  g.add(box(0.26, 0.02, 0.34, '#f8f9fa', { y: 0.06 }))
  g.add(box(0.05, 0.03, 0.02, '#495057', { y: 0.09, z: -0.15 }))
  return g
}
