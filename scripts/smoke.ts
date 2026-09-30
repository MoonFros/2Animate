import { simplify, smoothPts, resample, distToStroke } from '../src/core/geometry'
import { interpolateBetween, resampleCount, matchStrokes } from '../src/core/interpolate'
import { applyBrush } from '../src/core/sculpt'
import type { Stroke } from '../src/core/types'

const mk = (pts: number[][], id = 'a'): Stroke => ({ id, pts: pts.map(([x, y]) => ({ x, y, p: 1 })), color: '#000', width: 4, opacity: 1 })

const zig = mk(Array.from({ length: 40 }, (_, i) => [i * 5, i % 2 ? 10 : 0]))
console.log('simplify', zig.pts.length, '->', simplify(zig.pts, 3).length)
console.log('resample', resample(zig.pts, 10).length)
console.log('smooth y[5]', smoothPts(zig.pts, 0.8, 4)[5].y.toFixed(2))
console.log('dist', distToStroke(zig, 100, 50).toFixed(2))

const a = mk([[0, 0], [100, 0]], 'a')
const b = mk([[0, 100], [100, 100]], 'b')
const mid = interpolateBetween({ frame: 0, strokes: [a] }, { frame: 10, strokes: [b] }, 0.5)
console.log('interp mid y =', mid[0].pts[0].y.toFixed(1), 'pts', mid[0].pts.length)
const rev = interpolateBetween({ frame: 0, strokes: [a] }, { frame: 10, strokes: mk([[100, 100], [0, 100]], 'r') ? [mk([[100, 100], [0, 100]], 'r')] : [] }, 0.5)
console.log('interp reversed-match start x =', rev[0].pts[0].x.toFixed(1))
console.log('match pairs', matchStrokes([a], [b]).length, 'resampleCount', resampleCount(a.pts, 9).length)

const s2 = mk(Array.from({ length: 20 }, (_, i) => [i * 5, 0]), 's2')
applyBrush([s2], { tool: 'twist', x: 50, y: 0, dx: 0, dy: 0, radius: 60, strength: 1, invert: false, mask: null })
console.log('twist moved y?', s2.pts.some((q) => Math.abs(q.y) > 0.01))
applyBrush([s2], { tool: 'strength', x: 50, y: 0, dx: 0, dy: 0, radius: 60, strength: 1, invert: true, mask: null })
console.log('strength lowered?', (s2.pts[10].s ?? 1) < 1)
applyBrush([s2], { tool: 'pinch', x: 50, y: 0, dx: 0, dy: 0, radius: 60, strength: 1, invert: false, mask: null })
console.log('ok')
