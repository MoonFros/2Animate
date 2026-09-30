/**
 * Non-destructive layer modifiers, evaluated at render time — the browser
 * equivalent of Blender's Grease Pencil modifier stack.
 */
import type { Layer, Stroke } from './types'

export type ModifierKind = 'noise' | 'offset' | 'thickness' | 'build' | 'tint' | 'simplify'

export interface Modifier {
  id: string
  kind: ModifierKind
  enabled: boolean
  // noise
  factor?: number
  scale?: number
  step?: number
  thicknessFactor?: number
  // offset
  x?: number
  y?: number
  rot?: number
  scaleX?: number
  scaleY?: number
  // thickness
  mode?: 'multiply' | 'add'
  amount?: number
  // build
  buildMode?: 'sequential' | 'concurrent'
  start?: number
  length?: number
  reverse?: boolean
  // tint
  color?: string
  strength?: number
  // simplify
  tolerance?: number
}

export function defaultModifier(kind: ModifierKind): Modifier {
  const id = Math.random().toString(36).slice(2, 9)
  switch (kind) {
    case 'noise':
      return { id, kind, enabled: true, factor: 6, scale: 1, step: 2, thicknessFactor: 0.2 }
    case 'offset':
      return { id, kind, enabled: true, x: 0, y: 0, rot: 0, scaleX: 1, scaleY: 1 }
    case 'thickness':
      return { id, kind, enabled: true, mode: 'multiply', amount: 1.4 }
    case 'build':
      return { id, kind, enabled: true, buildMode: 'sequential', start: 0, length: 12, reverse: false }
    case 'tint':
      return { id, kind, enabled: true, color: '#3aa0ff', strength: 0.5 }
    case 'simplify':
      return { id, kind, enabled: true, tolerance: 2 }
  }
}

export const MODIFIER_LABELS: Record<ModifierKind, string> = {
  noise: 'Noise',
  offset: 'Offset',
  thickness: 'Thickness',
  build: 'Build',
  tint: 'Tint',
  simplify: 'Simplify',
}

/* deterministic value noise so playback is stable, not random flicker */
function hash(n: number) {
  let x = Math.sin(n * 12.9898) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

function mixHex(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const r = Math.round((((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t))
  const g = Math.round((((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t))
  const bl = Math.round(((pa & 255) * (1 - t) + (pb & 255) * t))
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)
}

const clone = (strokes: Stroke[]) => strokes.map((s) => ({ ...s, pts: s.pts.map((p) => ({ ...p })) }))

export function applyModifiers(strokes: Stroke[], layer: Layer, frame: number): Stroke[] {
  const mods = layer.modifiers?.filter((m) => m.enabled) ?? []
  if (!mods.length) return strokes
  let out = clone(strokes)

  for (const m of mods) {
    switch (m.kind) {
      case 'noise': {
        const step = Math.max(1, m.step ?? 2)
        const seedFrame = Math.floor(frame / step)
        const amp = m.factor ?? 6
        const scale = Math.max(0.05, m.scale ?? 1)
        out.forEach((s, si) => {
          s.pts.forEach((p, pi) => {
            const n1 = hash(seedFrame * 91.7 + si * 7.13 + pi * scale * 3.1)
            const n2 = hash(seedFrame * 53.3 + si * 3.77 + pi * scale * 5.9 + 100)
            p.x += n1 * amp
            p.y += n2 * amp
            if (m.thicknessFactor) p.p = Math.max(0.05, p.p * (1 + n1 * m.thicknessFactor))
          })
        })
        break
      }
      case 'offset': {
        const rot = ((m.rot ?? 0) * Math.PI) / 180
        const sx = m.scaleX ?? 1
        const sy = m.scaleY ?? 1
        let cx = 0
        let cy = 0
        let n = 0
        for (const s of out) for (const p of s.pts) (cx += p.x), (cy += p.y), n++
        cx /= Math.max(1, n)
        cy /= Math.max(1, n)
        for (const s of out) {
          for (const p of s.pts) {
            const ox = (p.x - cx) * sx
            const oy = (p.y - cy) * sy
            p.x = cx + ox * Math.cos(rot) - oy * Math.sin(rot) + (m.x ?? 0)
            p.y = cy + ox * Math.sin(rot) + oy * Math.cos(rot) + (m.y ?? 0)
          }
          s.width *= (sx + sy) / 2
        }
        break
      }
      case 'thickness': {
        for (const s of out) s.width = Math.max(0.05, m.mode === 'add' ? s.width + (m.amount ?? 0) : s.width * (m.amount ?? 1))
        break
      }
      case 'build': {
        // draw-on animation: reveal strokes/points over time
        const start = m.start ?? 0
        const len = Math.max(1, m.length ?? 12)
        let t = (frame - start) / len
        t = Math.max(0, Math.min(1, t))
        if (m.reverse) t = 1 - t
        if (m.buildMode === 'concurrent') {
          for (const s of out) {
            const keep = Math.max(1, Math.round(s.pts.length * t))
            s.pts = s.pts.slice(0, keep)
          }
          out = out.filter((s) => s.pts.length > 1)
        } else {
          const totalPts = out.reduce((a, s) => a + s.pts.length, 0)
          let budget = totalPts * t
          const kept: Stroke[] = []
          for (const s of out) {
            if (budget <= 1) break
            if (budget >= s.pts.length) {
              kept.push(s)
              budget -= s.pts.length
            } else {
              s.pts = s.pts.slice(0, Math.max(2, Math.round(budget)))
              kept.push(s)
              budget = 0
            }
          }
          out = kept
        }
        break
      }
      case 'tint': {
        const c = m.color ?? '#3aa0ff'
        const k = m.strength ?? 0.5
        for (const s of out) {
          s.color = mixHex(s.color, c, k)
          if (s.fill) s.fill = mixHex(s.fill, c, k)
        }
        break
      }
      case 'simplify': {
        const tol = Math.max(0.2, m.tolerance ?? 2)
        for (const s of out) {
          const keep = [s.pts[0]]
          for (let i = 1; i < s.pts.length - 1; i++) {
            const last = keep[keep.length - 1]
            if (Math.hypot(s.pts[i].x - last.x, s.pts[i].y - last.y) >= tol) keep.push(s.pts[i])
          }
          if (s.pts.length > 1) keep.push(s.pts[s.pts.length - 1])
          s.pts = keep
        }
        break
      }
    }
  }
  return out
}
