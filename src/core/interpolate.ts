/** In-betweening between two keyframes — Blender's "Interpolate Sequence". */
import type { Keyframe, Layer, Pt, Stroke } from './types'
import { uid } from './types'

export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'

export function ease(t: number, e: Easing) {
  switch (e) {
    case 'easeIn':
      return t * t
    case 'easeOut':
      return 1 - (1 - t) * (1 - t)
    case 'easeInOut':
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    default:
      return t
  }
}

/** Resample a polyline to exactly n points, evenly spaced by arc length. */
export function resampleCount(pts: Pt[], n: number): Pt[] {
  if (pts.length === 0) return []
  if (pts.length === 1) return Array.from({ length: n }, () => ({ ...pts[0] }))
  const seg: number[] = [0]
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    seg.push(total)
  }
  if (total === 0) return Array.from({ length: n }, () => ({ ...pts[0] }))
  const out: Pt[] = []
  let j = 1
  for (let k = 0; k < n; k++) {
    const d = (k / (n - 1)) * total
    while (j < seg.length - 1 && seg[j] < d) j++
    const t = (d - seg[j - 1]) / Math.max(1e-6, seg[j] - seg[j - 1])
    const a = pts[j - 1]
    const b = pts[j]
    out.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      p: a.p + (b.p - a.p) * t,
      s: (a.s ?? 1) + ((b.s ?? 1) - (a.s ?? 1)) * t,
    })
  }
  return out
}

const centroid = (s: Stroke) => {
  let x = 0
  let y = 0
  for (const q of s.pts) {
    x += q.x
    y += q.y
  }
  return { x: x / s.pts.length, y: y / s.pts.length }
}

const arcLen = (s: Stroke) => {
  let l = 0
  for (let i = 1; i < s.pts.length; i++) l += Math.hypot(s.pts[i].x - s.pts[i - 1].x, s.pts[i].y - s.pts[i - 1].y)
  return l
}

/** Greedy pairing of strokes between two drawings by position + length + colour. */
export function matchStrokes(a: Stroke[], b: Stroke[]) {
  const pairs: [Stroke | null, Stroke | null][] = []
  const usedB = new Set<number>()
  for (const sa of a) {
    const ca = centroid(sa)
    const la = arcLen(sa)
    let best = -1
    let bestScore = Infinity
    for (let i = 0; i < b.length; i++) {
      if (usedB.has(i)) continue
      const sb = b[i]
      const cb = centroid(sb)
      const score =
        Math.hypot(ca.x - cb.x, ca.y - cb.y) +
        Math.abs(la - arcLen(sb)) * 0.35 +
        (sa.color === sb.color ? 0 : 60) +
        (!!sa.fill === !!sb.fill ? 0 : 120)
      if (score < bestScore) {
        bestScore = score
        best = i
      }
    }
    if (best >= 0) {
      usedB.add(best)
      pairs.push([sa, b[best]])
    } else pairs.push([sa, null])
  }
  for (let i = 0; i < b.length; i++) if (!usedB.has(i)) pairs.push([null, b[i]])
  return pairs
}

function lerpStroke(a: Stroke, b: Stroke, t: number): Stroke {
  const n = Math.max(6, Math.min(400, Math.round(Math.max(a.pts.length, b.pts.length))))
  const pa = resampleCount(a.pts, n)
  const pb = resampleCount(b.pts, n)
  // walk b forwards or reversed, whichever is closer — stops strokes flipping
  const cost = (rev: boolean) => {
    let c = 0
    for (let i = 0; i < n; i += Math.max(1, n >> 3)) {
      const q = rev ? pb[n - 1 - i] : pb[i]
      c += Math.hypot(pa[i].x - q.x, pa[i].y - q.y)
    }
    return c
  }
  const rev = cost(true) < cost(false)
  const pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    const q = rev ? pb[n - 1 - i] : pb[i]
    pts.push({
      x: pa[i].x + (q.x - pa[i].x) * t,
      y: pa[i].y + (q.y - pa[i].y) * t,
      p: pa[i].p + (q.p - pa[i].p) * t,
      s: (pa[i].s ?? 1) + ((q.s ?? 1) - (pa[i].s ?? 1)) * t,
    })
  }
  return {
    id: uid(),
    pts,
    color: t < 0.5 ? a.color : b.color,
    width: a.width + (b.width - a.width) * t,
    opacity: a.opacity + (b.opacity - a.opacity) * t,
    fill: t < 0.5 ? a.fill ?? null : b.fill ?? null,
    closed: a.closed || b.closed,
  }
}

export function interpolateBetween(ka: Keyframe, kb: Keyframe, t: number): Stroke[] {
  const out: Stroke[] = []
  for (const [a, b] of matchStrokes(ka.strokes, kb.strokes)) {
    if (a && b) out.push(lerpStroke(a, b, t))
    else if (a) out.push({ ...a, id: uid(), pts: a.pts.map((q) => ({ ...q })), opacity: a.opacity * (1 - t) })
    else if (b) out.push({ ...b, id: uid(), pts: b.pts.map((q) => ({ ...q })), opacity: b.opacity * t })
  }
  return out
}

/** Fill every empty frame between the two keys surrounding `frame`. */
export function interpolateSequence(layer: Layer, frame: number, easing: Easing, step = 1) {
  const keys = [...layer.keys].sort((a, b) => a.frame - b.frame)
  let a: Keyframe | null = null
  let b: Keyframe | null = null
  for (let i = 0; i < keys.length - 1; i++) {
    if (keys[i].frame <= frame && keys[i + 1].frame > frame) {
      a = keys[i]
      b = keys[i + 1]
      break
    }
  }
  if (!a || !b || b.frame - a.frame < 2) return 0
  let made = 0
  for (let f = a.frame + 1; f < b.frame; f++) {
    if ((f - a.frame) % step !== 0) continue
    if (layer.keys.some((k) => k.frame === f)) continue
    const t = ease((f - a.frame) / (b.frame - a.frame), easing)
    layer.keys.push({ frame: f, strokes: interpolateBetween(a, b, t) })
    made++
  }
  layer.keys.sort((x, y) => x.frame - y.frame)
  return made
}
