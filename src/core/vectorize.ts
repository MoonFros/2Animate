/**
 * Paper photo -> editable vector strokes.
 *
 * Pipeline: grayscale -> illumination flattening (divide by heavily blurred
 * copy, kills paper tone + phone shadows) -> Otsu threshold -> despeckle ->
 * Zhang-Suen skeletonisation -> graph tracing -> RDP simplify -> smoothing,
 * with per-point width lifted from a distance transform so a fat marker line
 * comes back in as a fat stroke.
 */
import type { Pt, Stroke } from './types'
import { simplify, smoothPts } from './geometry'
import { uid } from './types'

export interface TraceOptions {
  /** longest side of the working image; smaller = faster, chunkier */
  maxSize: number
  /** -0.5 .. 0.5 nudge on the automatic threshold */
  threshold: number
  /** ignore blobs smaller than this many px */
  minArea: number
  /** RDP tolerance in px */
  detail: number
  /** 0..1 smoothing applied to traced lines */
  smooth: number
  /** multiply detected line thickness */
  widthScale: number
  /** keep original pen thickness variation instead of a uniform width */
  variableWidth: boolean
  color: string
}

export const defaultTraceOptions: TraceOptions = {
  maxSize: 1100,
  threshold: 0,
  minArea: 12,
  detail: 1.1,
  smooth: 0.55,
  widthScale: 1,
  variableWidth: true,
  color: '#111111',
}

export interface TraceResult {
  strokes: Stroke[]
  width: number
  height: number
  /** preview of the binarised ink mask */
  maskUrl: string
}

/* ---------------------------------------------------------------- helpers */

function drawToImageData(src: CanvasImageSource, w: number, h: number): ImageData {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(src, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

function toGray(img: ImageData): Float32Array {
  const { data, width, height } = img
  const g = new Float32Array(width * height)
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    // luma, with alpha composited over white
    const a = data[i + 3] / 255
    const v = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    g[j] = v * a + 255 * (1 - a)
  }
  return g
}

/** Box blur via integral image — O(n) regardless of radius. */
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const sum = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      row += src[y * w + x]
      sum[(y + 1) * (w + 1) + (x + 1)] = sum[y * (w + 1) + (x + 1)] + row
    }
  }
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(h - 1, y + r)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(w - 1, x + r)
      const area = (x1 - x0 + 1) * (y1 - y0 + 1)
      const s =
        sum[(y1 + 1) * (w + 1) + (x1 + 1)] -
        sum[y0 * (w + 1) + (x1 + 1)] -
        sum[(y1 + 1) * (w + 1) + x0] +
        sum[y0 * (w + 1) + x0]
      out[y * w + x] = s / area
    }
  }
  return out
}

function otsu(vals: Float32Array): number {
  const hist = new Float64Array(256)
  for (let i = 0; i < vals.length; i++) hist[Math.max(0, Math.min(255, vals[i] | 0))]++
  const total = vals.length
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0
  let wB = 0
  let best = 0
  let thr = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > best) {
      best = between
      thr = t
    }
  }
  return thr
}

/** Remove connected ink blobs below minArea (4-connected flood). */
function despeckle(bin: Uint8Array, w: number, h: number, minArea: number) {
  const seen = new Uint8Array(w * h)
  const stack = new Int32Array(w * h)
  const blob = new Int32Array(1024)
  for (let i = 0; i < bin.length; i++) {
    if (!bin[i] || seen[i]) continue
    let sp = 0
    let n = 0
    stack[sp++] = i
    seen[i] = 1
    const cells: number[] = []
    while (sp) {
      const c = stack[--sp]
      cells.push(c)
      n++
      const x = c % w
      const y = (c / w) | 0
      if (x > 0 && bin[c - 1] && !seen[c - 1]) (seen[c - 1] = 1), (stack[sp++] = c - 1)
      if (x < w - 1 && bin[c + 1] && !seen[c + 1]) (seen[c + 1] = 1), (stack[sp++] = c + 1)
      if (y > 0 && bin[c - w] && !seen[c - w]) (seen[c - w] = 1), (stack[sp++] = c - w)
      if (y < h - 1 && bin[c + w] && !seen[c + w]) (seen[c + w] = 1), (stack[sp++] = c + w)
    }
    if (n < minArea) for (const c of cells) bin[c] = 0
  }
  void blob
}

/** Zhang-Suen thinning to a 1px skeleton. */
function thin(src: Uint8Array, w: number, h: number): Uint8Array {
  const img = Uint8Array.from(src)
  const idx = (x: number, y: number) => y * w + x
  let changed = true
  const toClear: number[] = []
  let guard = 0
  while (changed && guard++ < 100) {
    changed = false
    for (let step = 0; step < 2; step++) {
      toClear.length = 0
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          if (!img[idx(x, y)]) continue
          const p2 = img[idx(x, y - 1)]
          const p3 = img[idx(x + 1, y - 1)]
          const p4 = img[idx(x + 1, y)]
          const p5 = img[idx(x + 1, y + 1)]
          const p6 = img[idx(x, y + 1)]
          const p7 = img[idx(x - 1, y + 1)]
          const p8 = img[idx(x - 1, y)]
          const p9 = img[idx(x - 1, y - 1)]
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
          if (b < 2 || b > 6) continue
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2]
          let a = 0
          for (let i = 0; i < 8; i++) if (seq[i] === 0 && seq[i + 1] === 1) a++
          if (a !== 1) continue
          if (step === 0) {
            if (p2 * p4 * p6 !== 0) continue
            if (p4 * p6 * p8 !== 0) continue
          } else {
            if (p2 * p4 * p8 !== 0) continue
            if (p2 * p6 * p8 !== 0) continue
          }
          toClear.push(idx(x, y))
        }
      }
      if (toClear.length) {
        changed = true
        for (const i of toClear) img[i] = 0
      }
    }
  }
  return img
}

/** Chamfer 3-4 distance transform of the ink mask (distance to background). */
function distanceTransform(bin: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9
  const d = new Float32Array(w * h)
  for (let i = 0; i < d.length; i++) d[i] = bin[i] ? INF : 0
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x])
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!bin[i]) continue
      d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4)
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      if (!bin[i]) continue
      d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4)
    }
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3
  return d
}

const N8 = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
]

/** Walk a 1px skeleton into polylines. */
function traceSkeleton(sk: Uint8Array, w: number, h: number): { x: number; y: number }[][] {
  const deg = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!sk[i]) continue
      let n = 0
      for (const [dx, dy] of N8) {
        const nx = x + dx
        const ny = y + dy
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && sk[ny * w + nx]) n++
      }
      deg[i] = n
    }
  }
  // visited edges keyed "a>b"
  const usedEdge = new Set<number>()
  const key = (a: number, b: number) => (a < b ? a * 4294967296 + b : b * 4294967296 + a)
  const paths: { x: number; y: number }[][] = []

  const neighbours = (i: number) => {
    const x = i % w
    const y = (i / w) | 0
    const out: number[] = []
    for (const [dx, dy] of N8) {
      const nx = x + dx
      const ny = y + dy
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && sk[ny * w + nx]) out.push(ny * w + nx)
    }
    return out
  }

  const walk = (start: number, first: number) => {
    const path = [{ x: start % w, y: (start / w) | 0 }]
    let prev = start
    let cur = first
    for (;;) {
      usedEdge.add(key(prev, cur))
      path.push({ x: cur % w, y: (cur / w) | 0 })
      if (deg[cur] !== 2) break
      const ns = neighbours(cur).filter((n) => !usedEdge.has(key(cur, n)))
      if (!ns.length) break
      prev = cur
      cur = ns[0]
    }
    if (path.length > 1) paths.push(path)
  }

  // 1. from nodes (endpoints + junctions)
  for (let i = 0; i < sk.length; i++) {
    if (!sk[i] || deg[i] === 2 || deg[i] === 0) continue
    for (const n of neighbours(i)) {
      if (usedEdge.has(key(i, n))) continue
      walk(i, n)
    }
  }
  // 2. leftover closed loops
  for (let i = 0; i < sk.length; i++) {
    if (!sk[i] || deg[i] !== 2) continue
    const ns = neighbours(i).filter((n) => !usedEdge.has(key(i, n)))
    if (!ns.length) continue
    walk(i, ns[0])
  }
  return paths
}

/* ------------------------------------------------------------------- main */

export function traceImage(
  src: CanvasImageSource,
  srcW: number,
  srcH: number,
  opts: TraceOptions,
): TraceResult {
  const scale = Math.min(1, opts.maxSize / Math.max(srcW, srcH))
  const w = Math.max(8, Math.round(srcW * scale))
  const h = Math.max(8, Math.round(srcH * scale))

  const img = drawToImageData(src, w, h)
  const gray = toGray(img)

  // illumination flattening
  const r = Math.max(6, Math.round(Math.max(w, h) / 12))
  const bg = boxBlur(gray, w, h, r)
  const flat = new Float32Array(w * h)
  for (let i = 0; i < flat.length; i++) {
    const v = (gray[i] / Math.max(1, bg[i])) * 255
    flat[i] = v > 255 ? 255 : v < 0 ? 0 : v
  }

  const auto = otsu(flat)
  const thr = Math.max(2, Math.min(253, auto * (1 + opts.threshold)))
  const bin = new Uint8Array(w * h)
  for (let i = 0; i < bin.length; i++) bin[i] = flat[i] < thr ? 1 : 0

  despeckle(bin, w, h, Math.max(0, Math.round(opts.minArea)))

  const dt = distanceTransform(bin, w, h)
  const sk = thin(bin, w, h)
  const rawPaths = traceSkeleton(sk, w, h)

  const inv = 1 / scale
  const strokes: Stroke[] = []
  for (const path of rawPaths) {
    if (path.length < 2) continue
    let pts: Pt[] = path.map((q) => {
      const d = dt[q.y * w + q.x] || 0.6
      return { x: q.x * inv, y: q.y * inv, p: d }
    })
    // path length filter (skip thinning nubs)
    let len = 0
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    if (len < 2.5 * inv) continue

    pts = simplify(pts, opts.detail * inv)
    if (pts.length < 2) continue
    if (opts.smooth > 0) pts = smoothPts(pts, opts.smooth, 2)

    // widths: distance transform is a half-width in downscaled px
    const widths = pts.map((q) => q.p)
    const avg = widths.reduce((a, b) => a + b, 0) / widths.length
    const base = Math.max(0.8, avg * 2 * inv * opts.widthScale)
    for (const q of pts) {
      q.p = opts.variableWidth ? Math.max(0.15, Math.min(2.2, q.p / Math.max(0.35, avg))) : 1
    }
    // taper the tips a little, like a real pen lift
    if (pts.length > 4) {
      pts[0].p *= 0.55
      pts[1].p *= 0.8
      pts[pts.length - 1].p *= 0.55
      pts[pts.length - 2].p *= 0.8
    }

    strokes.push({
      id: uid(),
      pts,
      color: opts.color,
      width: base,
      opacity: 1,
      fill: null,
      closed: false,
    })
  }

  // mask preview
  const mc = document.createElement('canvas')
  mc.width = w
  mc.height = h
  const mctx = mc.getContext('2d')!
  const mi = mctx.createImageData(w, h)
  for (let i = 0; i < bin.length; i++) {
    const v = bin[i] ? 0 : 255
    mi.data[i * 4] = v
    mi.data[i * 4 + 1] = v
    mi.data[i * 4 + 2] = v
    mi.data[i * 4 + 3] = 255
  }
  mctx.putImageData(mi, 0, 0)

  return { strokes, width: srcW, height: srcH, maskUrl: mc.toDataURL('image/png') }
}
