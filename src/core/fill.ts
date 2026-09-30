/**
 * Bucket fill, the way Blender's Grease Pencil does it: rasterise the visible
 * lines, close small gaps, flood fill the region under the cursor, trace the
 * region boundary back out as a vector shape.
 */
import type { Stroke } from './types'
import { uid } from './types'
import { simplify, smoothPts } from './geometry'
import { drawStroke } from './render'

export interface FillOptions {
  /** px of gap the fill is allowed to jump (dilates the line mask) */
  leak: number
  /** shrink/grow the finished shape so it tucks under the line */
  expand: number
  color: string
  /** work resolution cap — lower is faster */
  maxSize: number
  smooth: number
}

export const defaultFillOptions: FillOptions = { leak: 4, expand: 2, color: '#ffcc55', maxSize: 900, smooth: 0.4 }

function dilate(mask: Uint8Array, w: number, h: number, r: number) {
  if (r <= 0) return mask
  let cur = mask
  for (let step = 0; step < r; step++) {
    const next = new Uint8Array(cur.length)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        if (cur[i]) {
          next[i] = 1
          continue
        }
        if (
          (x > 0 && cur[i - 1]) ||
          (x < w - 1 && cur[i + 1]) ||
          (y > 0 && cur[i - w]) ||
          (y < h - 1 && cur[i + w])
        )
          next[i] = 1
      }
    }
    cur = next
  }
  return cur
}

/** Moore boundary tracing of a filled region -> outline polygon. */
function traceBoundary(region: Uint8Array, w: number, h: number, startIdx: number) {
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && region[y * w + x] === 1
  let sx = startIdx % w
  let sy = (startIdx / w) | 0
  while (inside(sx - 1, sy)) sx--
  const out: { x: number; y: number }[] = []
  const dirs = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ]
  let cx = sx
  let cy = sy
  let dir = 6
  const maxSteps = w * h * 4
  for (let step = 0; step < maxSteps; step++) {
    out.push({ x: cx, y: cy })
    let found = false
    for (let k = 0; k < 8; k++) {
      const d = (dir + 6 + k) % 8
      const nx = cx + dirs[d][0]
      const ny = cy + dirs[d][1]
      if (inside(nx, ny)) {
        cx = nx
        cy = ny
        dir = d
        found = true
        break
      }
    }
    if (!found) break
    if (cx === sx && cy === sy && out.length > 2) break
  }
  return out
}

/**
 * @param strokes visible strokes on the frame (doc space)
 * @param px,py   click point in doc space
 */
export function bucketFill(
  strokes: Stroke[],
  docW: number,
  docH: number,
  px: number,
  py: number,
  o: FillOptions,
): Stroke | null {
  const scale = Math.min(1, o.maxSize / Math.max(docW, docH))
  const w = Math.max(8, Math.round(docW * scale))
  const h = Math.max(8, Math.round(docH * scale))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.scale(scale, scale)
  for (const s of strokes) drawStroke(ctx, s, '#000000', 1)

  const img = ctx.getImageData(0, 0, w, h).data
  let lines = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) lines[i] = img[i * 4 + 3] > 40 ? 1 : 0
  lines = dilate(lines, w, h, Math.round(o.leak * scale))

  const sx = Math.round(px * scale)
  const sy = Math.round(py * scale)
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null
  if (lines[sy * w + sx]) return null

  // flood fill the empty region under the cursor (4-connected)
  const region = new Uint8Array(w * h)
  const stack = [sy * w + sx]
  region[sy * w + sx] = 1
  let count = 0
  let touchedEdge = false
  while (stack.length) {
    const i = stack.pop()!
    count++
    const x = i % w
    const y = (i / w) | 0
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchedEdge = true
    if (x > 0 && !lines[i - 1] && !region[i - 1]) (region[i - 1] = 1), stack.push(i - 1)
    if (x < w - 1 && !lines[i + 1] && !region[i + 1]) (region[i + 1] = 1), stack.push(i + 1)
    if (y > 0 && !lines[i - w] && !region[i - w]) (region[i - w] = 1), stack.push(i - w)
    if (y < h - 1 && !lines[i + w] && !region[i + w]) (region[i + w] = 1), stack.push(i + w)
  }
  if (count < 12) return null
  if (touchedEdge && count > w * h * 0.85) return null // leaked into the void

  // grow the region back under the lines so there is no hairline gap
  const grown = dilate(region, w, h, Math.max(0, Math.round((o.leak + o.expand) * scale)))
  const outline = traceBoundary(grown, w, h, sy * w + sx)
  if (outline.length < 8) return null

  const inv = 1 / scale
  let pts = outline.map((q) => ({ x: q.x * inv, y: q.y * inv, p: 1 }))
  pts = simplify(pts, 1.4 * inv)
  if (o.smooth > 0) pts = smoothPts(pts, o.smooth, 2)
  if (pts.length < 4) return null

  return {
    id: uid(),
    pts,
    color: o.color,
    width: 0.01,
    opacity: 1,
    fill: o.color,
    closed: true,
  }
}
