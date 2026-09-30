export interface Pt {
  x: number
  y: number
  /** 0..1 pressure / thickness multiplier */
  p: number
  /** 0..1 per-point strength (opacity), defaults to 1 */
  s?: number
}

export interface Stroke {
  id: string
  pts: Pt[]
  color: string
  /** base width in document px */
  width: number
  opacity: number
  /** fill closed shape with fillColor */
  fill?: string | null
  closed?: boolean
}

export interface Keyframe {
  /** frame index this drawing starts on */
  frame: number
  strokes: Stroke[]
}

export interface Layer {
  id: string
  name: string
  visible: boolean
  locked: boolean
  opacity: number
  /** tint applied on top of stroke colours, null = none */
  tint: string | null
  onion: boolean
  /** canvas composite mode, mirrors Blender's layer blend */
  blend?: 'normal' | 'multiply' | 'screen' | 'overlay' | 'lighten' | 'darken' | 'difference'
  keys: Keyframe[]
}

export interface Doc {
  width: number
  height: number
  fps: number
  frameCount: number
  bg: string
  layers: Layer[]
}

export type ToolId =
  | 'draw'
  | 'line'
  | 'fill'
  | 'erase'
  | 'select'
  | 'pan'
  // sculpt mode brushes (Blender Grease Pencil parity)
  | 'smooth'
  | 'thickness'
  | 'strength'
  | 'randomize'
  | 'grab'
  | 'push'
  | 'twist'
  | 'pinch'

export const SCULPT_TOOLS: ToolId[] = ['smooth', 'thickness', 'strength', 'randomize', 'grab', 'push', 'twist', 'pinch']
export const isSculpt = (t: ToolId) => SCULPT_TOOLS.includes(t)

export const uid = () => Math.random().toString(36).slice(2, 10)
