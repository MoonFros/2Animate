import { useEffect, useRef } from 'react'
import { useStore } from '../core/store'
import { renderDoc, drawStroke, keyIndexAt } from '../core/render'
import { distToStroke, falloff, resample, simplify, smoothPts, strokeBBox } from '../core/geometry'
import type { Pt, Stroke } from '../core/types'
import { uid } from '../core/types'

type Mode = null | 'draw' | 'line' | 'erase' | 'sculpt' | 'grab' | 'move' | 'box' | 'pan'

export default function Stage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // interaction state kept out of React for 60fps
  const live = useRef<{
    mode: Mode
    pts: Pt[]
    stroke: Stroke | null
    work: Stroke[] | null
    last: { x: number; y: number } | null
    start: { x: number; y: number } | null
    cursor: { x: number; y: number } | null
    panStart: { x: number; y: number; vx: number; vy: number } | null
    alt: boolean
    space: boolean
    box: { x0: number; y0: number; x1: number; y1: number } | null
  }>({ mode: null, pts: [], stroke: null, work: null, last: null, start: null, cursor: null, panStart: null, alt: false, space: false, box: null })

  /* ------------------------------------------------------------ helpers */
  const toDoc = (e: { clientX: number; clientY: number }) => {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    const { zoom, x, y } = useStore.getState().view
    const doc = useStore.getState().doc
    const fit = fitScale(r.width, r.height, doc.width, doc.height)
    const s = fit * zoom
    const cx = r.width / 2 + x
    const cy = r.height / 2 + y
    return {
      x: (e.clientX - r.left - cx) / s + doc.width / 2,
      y: (e.clientY - r.top - cy) / s + doc.height / 2,
    }
  }

  const fitScale = (cw: number, ch: number, dw: number, dh: number) => Math.min(cw / dw, ch / dh) * 0.92

  /* ------------------------------------------------------------- render */
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const c = canvasRef.current
      const wrap = wrapRef.current
      if (c && wrap) {
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        const w = wrap.clientWidth
        const h = wrap.clientHeight
        if (c.width !== Math.floor(w * dpr) || c.height !== Math.floor(h * dpr)) {
          c.width = Math.floor(w * dpr)
          c.height = Math.floor(h * dpr)
          c.style.width = w + 'px'
          c.style.height = h + 'px'
        }
        const ctx = c.getContext('2d')!
        const st = useStore.getState()
        const doc = st.doc
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, w, h)
        const fit = fitScale(w, h, doc.width, doc.height)
        const s = fit * st.view.zoom
        ctx.save()
        ctx.translate(w / 2 + st.view.x, h / 2 + st.view.y)
        ctx.scale(s, s)
        ctx.translate(-doc.width / 2, -doc.height / 2)

        // paper shadow
        ctx.save()
        ctx.shadowColor = 'rgba(0,0,0,0.45)'
        ctx.shadowBlur = 24 / s
        ctx.fillStyle = doc.bg
        ctx.fillRect(0, 0, doc.width, doc.height)
        ctx.restore()

        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 0, doc.width, doc.height)
        ctx.clip()

        // live sculpt/erase edits override the stored keyframe
        const workStrokes = live.current.work
        if (workStrokes) {
          const layer = st.activeLayer()
          const docCopy = { ...doc, layers: doc.layers.map((l) => (l.id === layer.id ? { ...l, keys: l.keys.map((k) => (k.frame === (layer.keys[keyIndexAt(layer, st.frame)]?.frame ?? -1) ? { ...k, strokes: workStrokes } : k)) } : l)) }
          renderDoc(ctx, docCopy, st.frame, st.onion, st.activeLayerId, { background: false })
        } else {
          renderDoc(ctx, doc, st.frame, st.onion, st.activeLayerId, { background: false })
        }

        // in-progress stroke
        if (live.current.stroke) drawStroke(ctx, live.current.stroke, null, 1)

        // selection highlight
        if (st.selection.length) {
          const layer = st.activeLayer()
          const ki = keyIndexAt(layer, st.frame)
          const strokes = (workStrokes ?? (ki >= 0 ? layer.keys[ki].strokes : [])) || []
          ctx.save()
          ctx.strokeStyle = '#ff9f1a'
          ctx.lineWidth = 1.5 / s
          ctx.setLineDash([6 / s, 4 / s])
          for (const sid of st.selection) {
            const stk = strokes.find((x) => x.id === sid)
            if (!stk) continue
            const b = strokeBBox(stk)
            ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0)
          }
          ctx.restore()
        }
        if (live.current.box) {
          const b = live.current.box
          ctx.save()
          ctx.strokeStyle = '#ff9f1a'
          ctx.setLineDash([5 / s, 3 / s])
          ctx.lineWidth = 1 / s
          ctx.strokeRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0))
          ctx.restore()
        }
        ctx.restore()

        // brush cursor
        const cur = live.current.cursor
        if (cur) {
          const tool = st.tool
          let r = 0
          if (tool === 'draw' || tool === 'line') r = st.brush.width / 2
          else if (tool === 'erase') r = st.eraser.radius
          else if (tool === 'smooth' || tool === 'thickness' || tool === 'grab') r = st.sculpt.radius
          if (r > 0) {
            ctx.beginPath()
            ctx.arc(cur.x, cur.y, Math.max(2 / s, r), 0, Math.PI * 2)
            ctx.strokeStyle = tool === 'erase' ? 'rgba(255,80,80,0.9)' : 'rgba(0,0,0,0.5)'
            ctx.lineWidth = 1 / s
            ctx.stroke()
          }
        }
        ctx.restore()
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  /* ------------------------------------------------------------ playback */
  useEffect(() => {
    let raf = 0
    let acc = 0
    let prev = performance.now()
    const tick = (t: number) => {
      const st = useStore.getState()
      const dt = t - prev
      prev = t
      if (st.playing) {
        acc += dt
        const step = 1000 / st.doc.fps
        while (acc >= step) {
          acc -= step
          const next = st.frame + 1
          if (next >= st.doc.frameCount) useStore.getState().setFrame(st.loop ? 0 : st.doc.frameCount - 1)
          else useStore.getState().setFrame(next)
        }
      } else acc = 0
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  /* -------------------------------------------------------- keyboard */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const st = useStore.getState()
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.code === 'Space') {
        live.current.space = true
        e.preventDefault()
      }
      if (e.altKey) live.current.alt = true
      const k = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault()
        e.shiftKey ? st.redo() : st.undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && k === 'y') {
        e.preventDefault()
        st.redo()
        return
      }
      if (e.ctrlKey || e.metaKey) return
      const map: Record<string, any> = { d: 'draw', b: 'draw', e: 'erase', s: 'smooth', t: 'thickness', g: 'grab', v: 'select', l: 'line' }
      if (map[k]) st.setTool(map[k])
      if (k === 'o') st.setOnion({ enabled: !st.onion.enabled })
      if (e.code === 'ArrowRight') st.setFrame(st.frame + 1)
      if (e.code === 'ArrowLeft') st.setFrame(st.frame - 1)
      if (e.code === 'Enter') st.setPlaying(!st.playing)
      if (k === 'delete' || k === 'backspace') {
        if (st.selection.length) {
          const layer = st.activeLayer()
          const ki = keyIndexAt(layer, st.frame)
          if (ki >= 0) {
            const keep = layer.keys[ki].strokes.filter((s) => !st.selection.includes(s.id))
            st.replaceStrokes(keep)
            st.setSelection([])
          }
        }
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') live.current.space = false
      if (!e.altKey) live.current.alt = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  /* ------------------------------------------------------------ pointer */
  const currentStrokes = (): Stroke[] => {
    const st = useStore.getState()
    const layer = st.activeLayer()
    const ki = keyIndexAt(layer, st.frame)
    return ki >= 0 ? layer.keys[ki].strokes : []
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const st = useStore.getState()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const p = toDoc(e)
    live.current.alt = e.altKey
    live.current.start = p
    live.current.last = p

    const wantPan = st.tool === 'pan' || live.current.space || e.button === 1 || e.buttons === 4
    if (wantPan) {
      live.current.mode = 'pan'
      live.current.panStart = { x: e.clientX, y: e.clientY, vx: st.view.x, vy: st.view.y }
      return
    }
    if (st.activeLayer().locked) return

    switch (st.tool) {
      case 'draw':
      case 'line': {
        live.current.mode = st.tool
        const pres = e.pressure && e.pressure > 0 && e.pointerType !== 'mouse' ? e.pressure : 0.75
        live.current.pts = [{ ...p, p: pres }]
        live.current.stroke = {
          id: uid(),
          pts: [{ ...p, p: pres }],
          color: st.brush.color,
          width: st.brush.width,
          opacity: st.brush.opacity,
          fill: null,
        }
        break
      }
      case 'erase':
        live.current.mode = 'erase'
        live.current.work = JSON.parse(JSON.stringify(currentStrokes()))
        applyErase(p)
        break
      case 'smooth':
      case 'thickness':
        live.current.mode = 'sculpt'
        live.current.work = JSON.parse(JSON.stringify(currentStrokes()))
        applySculpt(p)
        break
      case 'grab':
        live.current.mode = 'grab'
        live.current.work = JSON.parse(JSON.stringify(currentStrokes()))
        break
      case 'select': {
        const strokes = currentStrokes()
        let hit: Stroke | null = null
        let bestD = Infinity
        for (const s of strokes) {
          const d = distToStroke(s, p.x, p.y)
          if (d < Math.max(8, s.width) && d < bestD) {
            bestD = d
            hit = s
          }
        }
        if (hit) {
          const sel = e.shiftKey ? [...new Set([...st.selection, hit.id])] : st.selection.includes(hit.id) ? st.selection : [hit.id]
          st.setSelection(sel)
          live.current.mode = 'move'
          live.current.work = JSON.parse(JSON.stringify(strokes))
        } else {
          if (!e.shiftKey) st.setSelection([])
          live.current.mode = 'box'
          live.current.box = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }
        }
        break
      }
    }
  }

  const applyErase = (p: { x: number; y: number }) => {
    const st = useStore.getState()
    const r = st.eraser.radius
    const work = live.current.work
    if (!work) return
    if (st.eraser.whole) {
      live.current.work = work.filter((s) => distToStroke(s, p.x, p.y) > r)
      return
    }
    const out: Stroke[] = []
    for (const s of work) {
      if (distToStroke(s, p.x, p.y) > r + s.width) {
        out.push(s)
        continue
      }
      // split the polyline where it enters the eraser disc
      let run: Pt[] = []
      for (const q of s.pts) {
        if (Math.hypot(q.x - p.x, q.y - p.y) <= r) {
          if (run.length > 1) out.push({ ...s, id: uid(), pts: run })
          run = []
        } else run.push(q)
      }
      if (run.length > 1) out.push({ ...s, id: s.id, pts: run })
    }
    live.current.work = out
  }

  const applySculpt = (p: { x: number; y: number }) => {
    const st = useStore.getState()
    const { radius, strength } = st.sculpt
    const work = live.current.work
    if (!work) return
    const sign = live.current.alt ? -1 : 1
    for (const s of work) {
      const b = strokeBBox(s)
      if (p.x < b.x0 - radius || p.x > b.x1 + radius || p.y < b.y0 - radius || p.y > b.y1 + radius) continue
      const pts = s.pts
      if (st.tool === 'smooth') {
        const src = pts.map((q) => ({ ...q }))
        for (let i = 1; i < pts.length - 1; i++) {
          const w = falloff(Math.hypot(pts[i].x - p.x, pts[i].y - p.y), radius) * strength * 0.9
          if (w <= 0) continue
          const tx = (src[i - 1].x + src[i + 1].x) / 2
          const ty = (src[i - 1].y + src[i + 1].y) / 2
          pts[i].x += (tx - pts[i].x) * w
          pts[i].y += (ty - pts[i].y) * w
        }
      } else if (st.tool === 'thickness') {
        for (let i = 0; i < pts.length; i++) {
          const w = falloff(Math.hypot(pts[i].x - p.x, pts[i].y - p.y), radius) * strength * 0.18 * sign
          if (w === 0) continue
          pts[i].p = Math.max(0.05, Math.min(4, pts[i].p * (1 + w)))
        }
      }
    }
  }

  const applyGrab = (p: { x: number; y: number }, dx: number, dy: number) => {
    const st = useStore.getState()
    const { radius, strength } = st.sculpt
    const work = live.current.work
    if (!work) return
    for (const s of work) {
      for (const q of s.pts) {
        const w = falloff(Math.hypot(q.x - p.x, q.y - p.y), radius) * strength
        if (w <= 0) continue
        q.x += dx * w
        q.y += dy * w
      }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const st = useStore.getState()
    const p = toDoc(e)
    live.current.cursor = p
    live.current.alt = e.altKey
    const mode = live.current.mode
    if (!mode) return

    if (mode === 'pan') {
      const ps = live.current.panStart!
      st.setView({ x: ps.vx + (e.clientX - ps.x), y: ps.vy + (e.clientY - ps.y) })
      return
    }
    if (mode === 'draw') {
      const s = live.current.stroke!
      const pres = e.pressure && e.pressure > 0 && e.pointerType !== 'mouse' ? e.pressure : 0.75
      const last = s.pts[s.pts.length - 1]
      const stab = st.brush.stabilize * 0.8
      const np: Pt = { x: last.x + (p.x - last.x) * (1 - stab), y: last.y + (p.y - last.y) * (1 - stab), p: pres }
      if (Math.hypot(np.x - last.x, np.y - last.y) > 0.6) s.pts.push(np)
      return
    }
    if (mode === 'line') {
      const s = live.current.stroke!
      s.pts = [s.pts[0], { ...p, p: s.pts[0].p }]
      return
    }
    if (mode === 'erase') {
      applyErase(p)
      return
    }
    if (mode === 'sculpt') {
      applySculpt(p)
      return
    }
    if (mode === 'grab') {
      const last = live.current.last!
      applyGrab(p, p.x - last.x, p.y - last.y)
      live.current.last = p
      return
    }
    if (mode === 'move') {
      const last = live.current.last!
      const dx = p.x - last.x
      const dy = p.y - last.y
      const sel = st.selection
      for (const s of live.current.work ?? []) {
        if (!sel.includes(s.id)) continue
        for (const q of s.pts) {
          q.x += dx
          q.y += dy
        }
      }
      live.current.last = p
      return
    }
    if (mode === 'box') {
      live.current.box = { ...live.current.box!, x1: p.x, y1: p.y }
      return
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const st = useStore.getState()
    const mode = live.current.mode
    live.current.mode = null
    if (!mode) return

    if (mode === 'draw' || mode === 'line') {
      const s = live.current.stroke!
      live.current.stroke = null
      if (s.pts.length < 2) {
        s.pts.push({ ...s.pts[0], x: s.pts[0].x + 0.6, y: s.pts[0].y + 0.6, p: s.pts[0].p })
      }
      if (mode === 'draw') {
        s.pts = simplify(resample(s.pts, Math.max(1.5, s.width * 0.4)), 0.45)
        s.pts = smoothPts(s.pts, st.brush.stabilize * 0.6, 1)
        if (st.brush.taper && s.pts.length > 4) {
          s.pts[0].p *= 0.5
          s.pts[1].p *= 0.75
          s.pts[s.pts.length - 1].p *= 0.5
          s.pts[s.pts.length - 2].p *= 0.75
        }
      }
      st.addStroke(s)
      return
    }
    if (mode === 'box') {
      const b = live.current.box!
      live.current.box = null
      const x0 = Math.min(b.x0, b.x1)
      const x1 = Math.max(b.x0, b.x1)
      const y0 = Math.min(b.y0, b.y1)
      const y1 = Math.max(b.y0, b.y1)
      const ids = currentStrokes()
        .filter((s) => s.pts.some((q) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1))
        .map((s) => s.id)
      st.setSelection(e.shiftKey ? [...new Set([...st.selection, ...ids])] : ids)
      return
    }
    if (live.current.work) {
      const work = live.current.work
      live.current.work = null
      st.replaceStrokes(work)
    }
  }

  const onWheel = (e: React.WheelEvent) => {
    const st = useStore.getState()
    const f = Math.exp(-e.deltaY * 0.0015)
    st.setView({ zoom: Math.max(0.15, Math.min(12, st.view.zoom * f)) })
  }

  return (
    <div className="stage" ref={wrapRef} onWheel={onWheel}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => (live.current.cursor = null)}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  )
}
