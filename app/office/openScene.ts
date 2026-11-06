import { OfficeScene } from './office'
import type { OfficeHooks } from './office'

/**
 * The 3D scene, or null when the browser cannot start WebGL. The page keeps its header,
 * the board name and the link back either way; only the room is missing.
 */
export function openOfficeScene(container: HTMLElement, hooks: OfficeHooks = {}): OfficeScene | null {
  try {
    return new OfficeScene(container, hooks)
  } catch (error) {
    console.warn('The 3D office could not start.', error)
    return null
  }
}
