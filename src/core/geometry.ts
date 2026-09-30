import type { Pt, Stroke } from './types'

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

export function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, p: a.p + (b.p - a.p) * t }
}

/** Ramer–Douglas–Peucker simplification. */
export function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts.slice()
  const keep = new Uint8Array(pts.length)
  keep[0] = 1
  keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()!
    const a = pts[s]
    const b = pts[e]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    let best = -1
    let bestD = eps
    for (let i = s + 1; i < e; i++) {
      const p = pts[i]
      const d = Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / len
      if (d > bestD) {
        bestD = d
        best = i
      }
    }
    if (best >= 0) {
      keep[best] = 1
      stack.push([s, best], [best, e])
    }
  }
  const out: Pt[] = []
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i])
  return out
}

/** Moving-average smoothing, `amount` 0..1, `iters` passes. Endpoints pinned. */
export function smoothPts(pts: Pt[], amount = 0.5, iters = 1): Pt[] {
  let cur = pts.map((p) => ({ ...p }))
  for (let k = 0; k < iters; k++) {
    const next = cur.map((p) => ({ ...p }))
    for (let i = 1; i < cur.length - 1; i++) {
      const a = cur[i - 1]
      const b = cur[i]
      const c = cur[i + 1]
      next[i].x = b.x + ((a.x + c.x) / 2 - b.x) * amount
      next[i].y = b.y + ((a.y + c.y) / 2 - b.y) * amount
      next[i].p = b.p + ((a.p + c.p) / 2 - b.p) * amount
    }
    cur = next
  }
  return cur
}

/** Resample to roughly even spacing — keeps sculpt tools predictable. */
export function resample(pts: Pt[], spacing: number): Pt[] {
  if (pts.length < 2) return pts.slice()
  const out: Pt[] = [{ ...pts[0] }]
  let carry = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    let d = dist(a, b)
    if (d === 0) continue
    let t = 0
    while (carry + d >= spacing) {
      const need = (spacing - carry) / d
      t = t + need * (1 - t)
      out.push(lerpPt(a, b, t))
      carry = 0
      d = dist(out[out.length - 1], b)
    }
    carry += d
  }
  out.push({ ...pts[pts.length - 1] })
  return out
}

/** Catmull-Rom subdivision for silky curves at render time. */
export function spline(pts: Pt[], steps = 4): Pt[] {
  if (pts.length < 3) return pts.slice()
  const out: Pt[] = []
  const n = pts.length
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(n - 1, i + 2)]
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      const t2 = t * t
      const t3 = t2 * t
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        p: p1.p + (p2.p - p1.p) * t,
      })
    }
  }
  out.push({ ...pts[n - 1] })
  return out
}

export function bbox(pts: Pt[]) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of pts) {
    if (p.x < x0) x0 = p.x
    if (p.y < y0) y0 = p.y
    if (p.x > x1) x1 = p.x
    if (p.y > y1) y1 = p.y
  }
  return { x0, y0, x1, y1 }
}

export function strokeBBox(s: Stroke) {
  const b = bbox(s.pts)
  const pad = s.width
  return { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad }
}

/** Shortest distance from point to stroke polyline. */
export function distToStroke(s: Stroke, x: number, y: number): number {
  let best = Infinity
  const pts = s.pts
  if (pts.length === 1) return Math.hypot(pts[0].x - x, pts[0].y - y)
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const l2 = dx * dx + dy * dy
    let t = l2 ? ((x - a.x) * dx + (y - a.y) * dy) / l2 : 0
    t = Math.max(0, Math.min(1, t))
    const d = Math.hypot(a.x + t * dx - x, a.y + t * dy - y)
    if (d < best) best = d
  }
  return best
}

/** Falloff used by all sculpt-style brushes (smooth / thickness / grab). */
export function falloff(d: number, radius: number) {
  if (d >= radius) return 0
  const t = 1 - d / radius
  return t * t * (3 - 2 * t)
}
