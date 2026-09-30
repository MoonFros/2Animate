import { create } from 'zustand'
import type { Doc, Keyframe, Layer, Stroke, ToolId } from './types'
import { uid } from './types'
import type { OnionCfg } from './render'
import { keyIndexAt } from './render'
import { defaultFillOptions, type FillOptions } from './fill'
import { interpolateSequence, type Easing } from './interpolate'
import { simplify, smoothPts } from './geometry'

const clone = <T,>(v: T): T => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)))

export function newLayer(name: string): Layer {
  return {
    id: uid(),
    name,
    visible: true,
    locked: false,
    opacity: 1,
    tint: null,
    onion: true,
    keys: [{ frame: 0, strokes: [] }],
  }
}

function newDoc(): Doc {
  return {
    width: 1280,
    height: 720,
    fps: 12,
    frameCount: 48,
    bg: '#ffffff',
    layers: [newLayer('Lines')],
  }
}

export interface Brush {
  color: string
  width: number
  opacity: number
  /** input smoothing 0..1 */
  stabilize: number
  /** pressure/velocity taper */
  taper: boolean
}

interface State {
  doc: Doc
  frame: number
  playing: boolean
  loop: boolean
  activeLayerId: string
  tool: ToolId
  brush: Brush
  eraser: { radius: number; whole: boolean }
  sculpt: { radius: number; strength: number; maskSelected: boolean }
  fill: FillOptions
  onion: OnionCfg
  view: { zoom: number; x: number; y: number }
  selection: string[]
  past: Doc[]
  future: Doc[]

  // doc mutation
  commit: (mut: (d: Doc) => void, label?: string) => void
  undo: () => void
  redo: () => void
  loadDoc: (d: Doc) => void

  setFrame: (f: number) => void
  setPlaying: (p: boolean) => void
  setTool: (t: ToolId) => void
  setBrush: (b: Partial<Brush>) => void
  setEraser: (e: Partial<State['eraser']>) => void
  setSculpt: (s: Partial<State['sculpt']>) => void
  setFill: (f: Partial<FillOptions>) => void
  setOnion: (o: Partial<OnionCfg>) => void
  setView: (v: Partial<State['view']>) => void
  setActiveLayer: (id: string) => void
  setSelection: (ids: string[]) => void

  // convenience
  activeLayer: () => Layer
  activeKey: () => Keyframe | null
  ensureKey: () => Keyframe
  addStroke: (s: Stroke) => void
  replaceStrokes: (strokes: Stroke[]) => void
  /** Blender's Interpolate Sequence between the surrounding keys */
  interpolate: (easing: Easing, step: number) => number
  /** stroke operators applied to the selection (or everything if empty) */
  strokeOp: (op: 'simplify' | 'subdivide' | 'smooth' | 'cyclic' | 'reverse' | 'flipX' | 'flipY' | 'front' | 'back' | 'delete') => void
}

export const useStore = create<State>((set, get) => ({
  doc: newDoc(),
  frame: 0,
  playing: false,
  loop: true,
  activeLayerId: '',
  tool: 'draw',
  brush: { color: '#111111', width: 6, opacity: 1, stabilize: 0.45, taper: true },
  eraser: { radius: 18, whole: false },
  sculpt: { radius: 60, strength: 0.5, maskSelected: false },
  fill: { ...defaultFillOptions },
  onion: { enabled: true, before: 2, after: 1, beforeColor: '#ff4d4d', afterColor: '#3aa0ff', opacity: 0.35 },
  view: { zoom: 1, x: 0, y: 0 },
  selection: [],
  past: [],
  future: [],

  commit: (mut) => {
    const { doc, past } = get()
    const before = clone(doc)
    const next = clone(doc)
    mut(next)
    set({ doc: next, past: [...past.slice(-59), before], future: [] })
  },
  undo: () => {
    const { past, future, doc } = get()
    if (!past.length) return
    const prev = past[past.length - 1]
    set({ doc: prev, past: past.slice(0, -1), future: [clone(doc), ...future].slice(0, 60) })
  },
  redo: () => {
    const { past, future, doc } = get()
    if (!future.length) return
    set({ doc: future[0], future: future.slice(1), past: [...past, clone(doc)] })
  },
  loadDoc: (d) => set({ doc: d, past: [], future: [], frame: 0, activeLayerId: d.layers[0]?.id ?? '', selection: [] }),

  setFrame: (f) => set((s) => ({ frame: Math.max(0, Math.min(s.doc.frameCount - 1, Math.round(f))) })),
  setPlaying: (p) => set({ playing: p }),
  setTool: (t) => set({ tool: t }),
  setBrush: (b) => set((s) => ({ brush: { ...s.brush, ...b } })),
  setEraser: (e) => set((s) => ({ eraser: { ...s.eraser, ...e } })),
  setSculpt: (v) => set((s) => ({ sculpt: { ...s.sculpt, ...v } })),
  setFill: (v) => set((s) => ({ fill: { ...s.fill, ...v } })),
  setOnion: (o) => set((s) => ({ onion: { ...s.onion, ...o } })),
  setView: (v) => set((s) => ({ view: { ...s.view, ...v } })),
  setActiveLayer: (id) => set({ activeLayerId: id, selection: [] }),
  setSelection: (ids) => set({ selection: ids }),

  activeLayer: () => {
    const { doc, activeLayerId } = get()
    return doc.layers.find((l) => l.id === activeLayerId) ?? doc.layers[doc.layers.length - 1]
  },
  activeKey: () => {
    const l = get().activeLayer()
    const i = keyIndexAt(l, get().frame)
    return i >= 0 ? l.keys[i] : null
  },
  ensureKey: () => {
    const { frame } = get()
    const layerId = get().activeLayer().id
    let created = false
    get().commit((d) => {
      const l = d.layers.find((x) => x.id === layerId)!
      if (!l.keys.some((k) => k.frame === frame)) {
        const src = keyIndexAt(l, frame)
        void src
        l.keys.push({ frame, strokes: [] })
        l.keys.sort((a, b) => a.frame - b.frame)
        created = true
      }
    })
    void created
    const l2 = get().activeLayer()
    return l2.keys.find((k) => k.frame === frame)!
  },
  addStroke: (s) => {
    const frame = get().frame
    const layerId = get().activeLayer().id
    get().commit((d) => {
      const l = d.layers.find((x) => x.id === layerId)!
      let k = l.keys.find((kk) => kk.frame === frame)
      if (!k) {
        k = { frame, strokes: [] }
        l.keys.push(k)
        l.keys.sort((a, b) => a.frame - b.frame)
      }
      k.strokes.push(s)
    })
  },
  replaceStrokes: (strokes) => {
    const frame = get().frame
    const layer = get().activeLayer()
    const ki = keyIndexAt(layer, frame)
    const targetFrame = ki >= 0 ? layer.keys[ki].frame : frame
    const layerId = layer.id
    get().commit((d) => {
      const l = d.layers.find((x) => x.id === layerId)!
      let k = l.keys.find((kk) => kk.frame === targetFrame)
      if (!k) {
        k = { frame: targetFrame, strokes: [] }
        l.keys.push(k)
        l.keys.sort((a, b) => a.frame - b.frame)
      }
      k.strokes = strokes
    })
  },
  interpolate: (easing, step) => {
    let made = 0
    const layerId = get().activeLayer().id
    const frame = get().frame
    get().commit((d) => {
      const l = d.layers.find((x) => x.id === layerId)!
      made = interpolateSequence(l, frame, easing, step)
    })
    return made
  },

  strokeOp: (op) => {
    const st = get()
    const layer = st.activeLayer()
    const ki = keyIndexAt(layer, st.frame)
    if (ki < 0) return
    const targetFrame = layer.keys[ki].frame
    const sel = st.selection
    const layerId = layer.id
    get().commit((d) => {
      const l = d.layers.find((x) => x.id === layerId)!
      const k = l.keys.find((kk) => kk.frame === targetFrame)!
      const hit = (s: Stroke) => sel.length === 0 || sel.includes(s.id)
      if (op === 'delete') {
        k.strokes = k.strokes.filter((s) => !hit(s))
        return
      }
      if (op === 'front' || op === 'back') {
        const moved = k.strokes.filter(hit)
        const rest = k.strokes.filter((s) => !hit(s))
        k.strokes = op === 'front' ? [...rest, ...moved] : [...moved, ...rest]
        return
      }
      let cx = 0
      let cy = 0
      let n = 0
      if (op === 'flipX' || op === 'flipY') {
        for (const s of k.strokes) if (hit(s)) for (const q of s.pts) (cx += q.x), (cy += q.y), n++
        cx /= Math.max(1, n)
        cy /= Math.max(1, n)
      }
      for (const s of k.strokes) {
        if (!hit(s)) continue
        switch (op) {
          case 'simplify':
            s.pts = simplify(s.pts, Math.max(0.8, s.width * 0.35))
            break
          case 'smooth':
            s.pts = smoothPts(s.pts, 0.6, 3)
            break
          case 'subdivide': {
            const out: typeof s.pts = []
            for (let i = 0; i < s.pts.length; i++) {
              out.push(s.pts[i])
              const b = s.pts[i + 1]
              if (b)
                out.push({
                  x: (s.pts[i].x + b.x) / 2,
                  y: (s.pts[i].y + b.y) / 2,
                  p: (s.pts[i].p + b.p) / 2,
                  s: ((s.pts[i].s ?? 1) + (b.s ?? 1)) / 2,
                })
            }
            s.pts = out
            break
          }
          case 'reverse':
            s.pts = s.pts.slice().reverse()
            break
          case 'cyclic':
            s.closed = !s.closed
            if (s.closed) s.pts = [...s.pts, { ...s.pts[0] }]
            break
          case 'flipX':
            for (const q of s.pts) q.x = 2 * cx - q.x
            break
          case 'flipY':
            for (const q of s.pts) q.y = 2 * cy - q.y
            break
        }
      }
    })
  },
}))

// initialise active layer id
const d0 = useStore.getState().doc
useStore.setState({ activeLayerId: d0.layers[0].id })
