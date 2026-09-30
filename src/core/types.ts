export interface Pt {
  x: number
  y: number
  /** 0..1 pressure / thickness multiplier */
  p: number
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
  | 'erase'
  | 'smooth'
  | 'thickness'
  | 'grab'
  | 'select'
  | 'line'
  | 'pan'

export const uid = () => Math.random().toString(36).slice(2, 10)
