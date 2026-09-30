import type { Doc, Layer, Stroke } from './types'
import { spline } from './geometry'

/** Build the two-sided outline of a variable-width stroke and fill it. */
export function strokePath(ctx: CanvasRenderingContext2D, s: Stroke) {
  const pts = s.pts.length > 2 ? spline(s.pts, 3) : s.pts
  if (pts.length === 0) return
  const hw = (i: number) => Math.max(0.05, (s.width * (pts[i].p ?? 1)) / 2)

  if (pts.length === 1) {
    ctx.beginPath()
    ctx.arc(pts[0].x, pts[0].y, hw(0), 0, Math.PI * 2)
    return
  }

  const left: { x: number; y: number }[] = []
  const right: { x: number; y: number }[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(pts.length - 1, i + 1)]
    let dx = b.x - a.x
    let dy = b.y - a.y
    const l = Math.hypot(dx, dy) || 1
    dx /= l
    dy /= l
    const nx = -dy
    const ny = dx
    const r = hw(i)
    left.push({ x: pts[i].x + nx * r, y: pts[i].y + ny * r })
    right.push({ x: pts[i].x - nx * r, y: pts[i].y - ny * r })
  }

  ctx.beginPath()
  ctx.moveTo(left[0].x, left[0].y)
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y)
  // round cap at the end
  const last = pts[pts.length - 1]
  ctx.arc(last.x, last.y, hw(pts.length - 1), Math.atan2(left[left.length - 1].y - last.y, left[left.length - 1].x - last.x), Math.atan2(right[right.length - 1].y - last.y, right[right.length - 1].x - last.x))
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y)
  const first = pts[0]
  ctx.arc(first.x, first.y, hw(0), Math.atan2(right[0].y - first.y, right[0].x - first.x), Math.atan2(left[0].y - first.y, left[0].x - first.x))
  ctx.closePath()
}

function fillPath(ctx: CanvasRenderingContext2D, s: Stroke) {
  const pts = s.pts.length > 2 ? spline(s.pts, 3) : s.pts
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.closePath()
}

export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, tint: string | null, alpha: number) {
  ctx.save()
  ctx.globalAlpha = alpha * (s.opacity ?? 1)
  if (s.fill) {
    fillPath(ctx, s)
    ctx.fillStyle = s.fill
    ctx.fill()
  }
  strokePath(ctx, s)
  ctx.fillStyle = tint ?? s.color
  ctx.fill()
  ctx.restore()
}

export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], tint: string | null, alpha: number) {
  for (const s of strokes) drawStroke(ctx, s, tint, alpha)
}

/** Keyframe visible on `frame` (hold-until-next, like a real exposure sheet). */
export function keyAt(layer: Layer, frame: number) {
  let best: Layer['keys'][number] | null = null
  for (const k of layer.keys) if (k.frame <= frame && (!best || k.frame > best.frame)) best = k
  return best
}

export function keyIndexAt(layer: Layer, frame: number) {
  let bi = -1
  for (let i = 0; i < layer.keys.length; i++) {
    const k = layer.keys[i]
    if (k.frame <= frame && (bi < 0 || k.frame > layer.keys[bi].frame)) bi = i
  }
  return bi
}

export interface OnionCfg {
  enabled: boolean
  before: number
  after: number
  beforeColor: string
  afterColor: string
  opacity: number
}

export function renderDoc(
  ctx: CanvasRenderingContext2D,
  doc: Doc,
  frame: number,
  onion: OnionCfg,
  activeLayerId: string | null,
  opts: { background?: boolean } = {},
) {
  ctx.clearRect(0, 0, doc.width, doc.height)
  if (opts.background !== false) {
    ctx.fillStyle = doc.bg
    ctx.fillRect(0, 0, doc.width, doc.height)
  }

  for (const layer of doc.layers) {
    if (!layer.visible) continue

    if (onion.enabled && layer.onion && layer.id === activeLayerId) {
      const sorted = [...layer.keys].sort((a, b) => a.frame - b.frame)
      const ci = sorted.findIndex((k) => k.frame === (keyAt(layer, frame)?.frame ?? -1))
      for (let o = 1; o <= onion.before; o++) {
        const k = sorted[ci - o]
        if (!k) break
        drawStrokes(ctx, k.strokes, onion.beforeColor, (onion.opacity * (1 - (o - 1) / (onion.before + 1))) * layer.opacity)
      }
      for (let o = 1; o <= onion.after; o++) {
        const k = sorted[ci + o]
        if (!k) break
        drawStrokes(ctx, k.strokes, onion.afterColor, (onion.opacity * (1 - (o - 1) / (onion.after + 1))) * layer.opacity)
      }
    }

    const k = keyAt(layer, frame)
    if (k) drawStrokes(ctx, k.strokes, layer.tint, layer.opacity)
  }
}
