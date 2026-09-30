/** Grease-Pencil-style sculpt brushes, all operating on stroke point arrays. */
import type { Stroke, ToolId } from './types'
import { falloff, strokeBBox } from './geometry'

export interface BrushCtx {
  tool: ToolId
  /** brush position in doc space */
  x: number
  y: number
  /** movement since the last event */
  dx: number
  dy: number
  radius: number
  strength: number
  /** Ctrl/Alt held — inverts the brush like Blender does */
  invert: boolean
  /** only affect these stroke ids (selection masking); null = everything */
  mask: string[] | null
  /** colour used by the tint brush */
  color?: string
}

function mixHex(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t)
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t)
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t)
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)
}

export function applyBrush(strokes: Stroke[], b: BrushCtx) {
  const sign = b.invert ? -1 : 1
  for (const s of strokes) {
    if (b.mask && !b.mask.includes(s.id)) continue
    const bb = strokeBBox(s)
    if (b.x < bb.x0 - b.radius || b.x > bb.x1 + b.radius || b.y < bb.y0 - b.radius || b.y > bb.y1 + b.radius) continue
    const pts = s.pts
    const w = (i: number) => falloff(Math.hypot(pts[i].x - b.x, pts[i].y - b.y), b.radius) * b.strength

    switch (b.tool) {
      case 'smooth': {
        const src = pts.map((q) => ({ ...q }))
        for (let i = 1; i < pts.length - 1; i++) {
          const f = w(i) * 0.9
          if (f <= 0) continue
          pts[i].x += ((src[i - 1].x + src[i + 1].x) / 2 - pts[i].x) * f
          pts[i].y += ((src[i - 1].y + src[i + 1].y) / 2 - pts[i].y) * f
        }
        break
      }
      case 'thickness': {
        for (let i = 0; i < pts.length; i++) {
          const f = w(i) * 0.2 * sign
          if (f === 0) continue
          pts[i].p = Math.max(0.03, Math.min(6, pts[i].p * (1 + f)))
        }
        break
      }
      case 'strength': {
        for (let i = 0; i < pts.length; i++) {
          const f = w(i) * 0.12 * sign
          if (f === 0) continue
          pts[i].s = Math.max(0, Math.min(1, (pts[i].s ?? 1) + f))
        }
        break
      }
      case 'randomize': {
        for (let i = 0; i < pts.length; i++) {
          const f = w(i)
          if (f <= 0) continue
          const amp = b.radius * 0.04 * f
          pts[i].x += (Math.random() - 0.5) * amp
          pts[i].y += (Math.random() - 0.5) * amp
          pts[i].p = Math.max(0.05, pts[i].p * (1 + (Math.random() - 0.5) * 0.25 * f))
        }
        break
      }
      case 'grab':
      case 'push': {
        // grab drags points with the cursor; push smears them along the stroke direction
        const scale = b.tool === 'grab' ? 1 : 0.85
        for (let i = 0; i < pts.length; i++) {
          const f = w(i) * scale
          if (f <= 0) continue
          pts[i].x += b.dx * f
          pts[i].y += b.dy * f
        }
        break
      }
      case 'twist': {
        const ang = 0.09 * b.strength * sign
        for (let i = 0; i < pts.length; i++) {
          const f = w(i)
          if (f <= 0) continue
          const a = ang * f
          const ox = pts[i].x - b.x
          const oy = pts[i].y - b.y
          const c = Math.cos(a)
          const sn = Math.sin(a)
          pts[i].x = b.x + ox * c - oy * sn
          pts[i].y = b.y + ox * sn + oy * c
        }
        break
      }
      case 'tint': {
        const target = b.color ?? '#3aa0ff'
        for (let i = 0; i < pts.length; i++) {
          const f = w(i) * 0.25
          if (f <= 0) continue
          if (b.invert) {
            // wipe vertex colour back to the stroke colour
            const cur = pts[i].c
            if (!cur) continue
            const back = mixHex(cur, s.color, Math.min(1, f * 2))
            pts[i].c = back.toLowerCase() === s.color.toLowerCase() ? undefined : back
          } else {
            pts[i].c = mixHex(pts[i].c ?? s.color, target, Math.min(1, f))
          }
        }
        break
      }
      case 'pinch': {
        for (let i = 0; i < pts.length; i++) {
          const f = w(i) * 0.09 * sign
          if (f === 0) continue
          pts[i].x += (b.x - pts[i].x) * f
          pts[i].y += (b.y - pts[i].y) * f
        }
        break
      }
    }
  }
}
