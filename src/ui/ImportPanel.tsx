import { useEffect, useMemo, useRef, useState } from 'react'
import { traceImage, defaultTraceOptions, type TraceOptions } from '../core/vectorize'
import type { Stroke } from '../core/types'
import { useStore } from '../core/store'
import { uid } from '../core/types'

interface Loaded {
  name: string
  img: HTMLImageElement
}

interface Crop {
  x: number
  y: number
  w: number
  h: number
}
const FULL: Crop = { x: 0, y: 0, w: 1, h: 1 }

function cropCanvas(img: HTMLImageElement, c: Crop) {
  const sx = Math.round(c.x * img.naturalWidth)
  const sy = Math.round(c.y * img.naturalHeight)
  const sw = Math.max(8, Math.round(c.w * img.naturalWidth))
  const sh = Math.max(8, Math.round(c.h * img.naturalHeight))
  const cv = document.createElement('canvas')
  cv.width = sw
  cv.height = sh
  cv.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
  return cv
}

function fitStrokes(strokes: Stroke[], sw: number, sh: number, dw: number, dh: number): Stroke[] {
  const s = Math.min(dw / sw, dh / sh)
  const ox = (dw - sw * s) / 2
  const oy = (dh - sh * s) / 2
  return strokes.map((st) => ({
    ...st,
    id: uid(),
    width: st.width * s,
    pts: st.pts.map((p) => ({ x: p.x * s + ox, y: p.y * s + oy, p: p.p })),
  }))
}

export default function ImportPanel({ onClose }: { onClose: () => void }) {
  const [files, setFiles] = useState<Loaded[]>([])
  const [active, setActive] = useState(0)
  const [opts, setOpts] = useState<TraceOptions>(defaultTraceOptions)
  const [crop, setCrop] = useState<Crop>(FULL)
  const [tab, setTab] = useState<'vector' | 'source' | 'mask'>('vector')
  const [busy, setBusy] = useState('')
  const [preview, setPreview] = useState<{ strokes: Stroke[]; w: number; h: number } | null>(null)
  const [maskUrl, setMaskUrl] = useState('')
  const [spacing, setSpacing] = useState(2)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cropRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number } | null>(null)

  const doc = useStore((s) => s.doc)
  const commit = useStore((s) => s.commit)
  const frame = useStore((s) => s.frame)
  const activeLayerId = useStore((s) => s.activeLayerId)

  const cur = files[active]

  const loadImages = async (srcs: { name: string; url: string }[]) => {
    const out: Loaded[] = []
    for (const s of srcs) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise((res, rej) => {
        img.onload = res
        img.onerror = rej
        img.src = s.url
      })
      out.push({ name: s.name, img })
    }
    out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    setFiles(out)
    setActive(0)
    setCrop(FULL)
  }

  const onFiles = (list: FileList | null) => {
    if (!list?.length) return
    loadImages(Array.from(list).map((f) => ({ name: f.name, url: URL.createObjectURL(f) })))
  }

  /* --------------------------------------------------------- tracing */
  useEffect(() => {
    if (!cur) {
      setPreview(null)
      return
    }
    let cancelled = false
    setBusy('tracing…')
    const t = setTimeout(() => {
      const src = cropCanvas(cur.img, crop)
      const res = traceImage(src, src.width, src.height, opts)
      if (cancelled) return
      setPreview({ strokes: res.strokes, w: res.width, h: res.height })
      setMaskUrl(res.maskUrl)
      setBusy('')
    }, 80)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [cur, crop, opts])

  useEffect(() => {
    const c = canvasRef.current
    if (!c || !preview || tab !== 'vector') return
    const W = 520
    const H = Math.max(1, Math.round((W * preview.h) / preview.w))
    c.width = W
    c.height = H
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, W, H)
    const s = W / preview.w
    ctx.save()
    ctx.scale(s, s)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const st of preview.strokes) {
      ctx.strokeStyle = st.color
      ctx.beginPath()
      for (let i = 1; i < st.pts.length; i++) {
        const a = st.pts[i - 1]
        const b = st.pts[i]
        ctx.beginPath()
        ctx.lineWidth = Math.max(0.3, st.width * ((a.p + b.p) / 2))
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
    }
    ctx.restore()
  }, [preview, tab])

  /* ------------------------------------------------------ crop drag */
  const cropPos = (e: React.PointerEvent) => {
    const r = cropRef.current!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }
  const cropDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = cropPos(e)
  }
  const cropMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const p = cropPos(e)
    const a = dragRef.current
    setCrop({ x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) })
  }
  const cropUp = () => {
    dragRef.current = null
    setCrop((c) => (c.w < 0.05 || c.h < 0.05 ? FULL : c))
  }

  const cropStyle = useMemo(
    () => ({ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }),
    [crop],
  )

  /* ---------------------------------------------------------- place */
  const place = async (asSequence: boolean) => {
    if (!files.length) return
    setBusy('placing…')
    const batch: { frame: number; strokes: Stroke[] }[] = []
    const targets = asSequence ? files : [cur]
    for (let i = 0; i < targets.length; i++) {
      const src = cropCanvas(targets[i].img, crop)
      const res = traceImage(src, src.width, src.height, opts)
      batch.push({
        frame: frame + (asSequence ? i * Math.max(1, spacing) : 0),
        strokes: fitStrokes(res.strokes, res.width, res.height, doc.width, doc.height),
      })
      setBusy(`placing ${i + 1}/${targets.length}…`)
      await new Promise((r) => setTimeout(r))
    }
    commit((d) => {
      const l = d.layers.find((x) => x.id === activeLayerId)!
      for (const b of batch) {
        if (b.frame >= d.frameCount) d.frameCount = b.frame + 1
        let k = l.keys.find((kk) => kk.frame === b.frame)
        if (!k) {
          k = { frame: b.frame, strokes: [] }
          l.keys.push(k)
        }
        k.strokes = [...k.strokes, ...b.strokes]
      }
      l.keys.sort((a, b) => a.frame - b.frame)
    })
    setBusy('')
    onClose()
  }

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h2>Import paper drawings</h2>
          <button onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="import-left">
            <label className="drop">
              <input type="file" accept="image/*" multiple onChange={(e) => onFiles(e.target.files)} />
              <span>📷 Choose photos / scans</span>
              <small>Pick several at once to import a whole flipbook</small>
            </label>
            <div className="hgroup">
              <label className="drop cam" style={{ flex: 1 }}>
                <input type="file" accept="image/*" capture="environment" onChange={(e) => onFiles(e.target.files)} />
                <span>Phone camera</span>
              </label>
              <button style={{ flex: 1 }} onClick={() => loadImages([{ name: 'sample', url: '/samples/paper-01.jpg' }])}>
                Load sample
              </button>
            </div>

            {files.length > 1 && (
              <div className="thumbs">
                {files.map((f, i) => (
                  <button key={f.name + i} className={'thumb' + (i === active ? ' on' : '')} onClick={() => setActive(i)}>
                    <img src={f.img.src} alt={f.name} />
                    <span>{i + 1}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="opts">
              <div className="row">
                <label>Threshold</label>
                <input type="range" min={-0.45} max={0.45} step={0.01} value={opts.threshold} onChange={(e) => setOpts({ ...opts, threshold: +e.target.value })} />
                <span className="num">{opts.threshold.toFixed(2)}</span>
              </div>
              <div className="row">
                <label>Detail</label>
                <input type="range" min={0.3} max={4} step={0.1} value={opts.detail} onChange={(e) => setOpts({ ...opts, detail: +e.target.value })} />
                <span className="num">{opts.detail.toFixed(1)}</span>
              </div>
              <div className="row">
                <label>Smooth</label>
                <input type="range" min={0} max={0.95} step={0.05} value={opts.smooth} onChange={(e) => setOpts({ ...opts, smooth: +e.target.value })} />
                <span className="num">{opts.smooth.toFixed(2)}</span>
              </div>
              <div className="row">
                <label>Despeckle</label>
                <input type="range" min={0} max={200} step={2} value={opts.minArea} onChange={(e) => setOpts({ ...opts, minArea: +e.target.value })} />
                <span className="num">{opts.minArea}</span>
              </div>
              <div className="row">
                <label>Line weight</label>
                <input type="range" min={0.3} max={3} step={0.05} value={opts.widthScale} onChange={(e) => setOpts({ ...opts, widthScale: +e.target.value })} />
                <span className="num">{opts.widthScale.toFixed(2)}</span>
              </div>
              <div className="row">
                <label>Quality</label>
                <input type="range" min={500} max={1800} step={100} value={opts.maxSize} onChange={(e) => setOpts({ ...opts, maxSize: +e.target.value })} />
                <span className="num">{opts.maxSize}</span>
              </div>
              <label className="check">
                <input type="checkbox" checked={opts.variableWidth} onChange={(e) => setOpts({ ...opts, variableWidth: e.target.checked })} /> Keep pen pressure variation
              </label>
              <div className="row">
                <label>Ink colour</label>
                <input type="color" value={opts.color} onChange={(e) => setOpts({ ...opts, color: e.target.value })} />
              </div>
              {files.length > 1 && (
                <div className="row">
                  <label>Frames apart</label>
                  <input type="number" min={1} max={24} value={spacing} onChange={(e) => setSpacing(+e.target.value)} />
                </div>
              )}
            </div>
          </div>

          <div className="import-right">
            <div className="preview-head">
              <div className="tabs">
                <button className={tab === 'vector' ? 'on' : ''} onClick={() => setTab('vector')}>Vector</button>
                <button className={tab === 'source' ? 'on' : ''} onClick={() => setTab('source')}>Crop</button>
                <button className={tab === 'mask' ? 'on' : ''} onClick={() => setTab('mask')}>Ink mask</button>
              </div>
              <span>{busy || `${preview?.strokes.length ?? 0} strokes`}</span>
            </div>

            <div className="preview">
              {!cur && <span className="hint" style={{ padding: 30 }}>Pick a photo to start — or hit “Load sample”.</span>}
              {cur && tab === 'source' && (
                <div className="cropwrap" ref={cropRef} onPointerDown={cropDown} onPointerMove={cropMove} onPointerUp={cropUp}>
                  <img src={cur.img.src} alt="source" draggable={false} />
                  <div className="cropbox" style={cropStyle} />
                </div>
              )}
              {cur && tab === 'mask' && maskUrl && <img src={maskUrl} alt="ink mask" />}
              {cur && tab === 'vector' && <canvas ref={canvasRef} />}
            </div>

            <div className="preview-foot">
              {tab === 'source' ? (
                <p className="hint">Drag a box around just the paper — anything outside (desk, hands, shadows) is ignored. <button className="mini-btn" onClick={() => setCrop(FULL)}>reset crop</button></p>
              ) : (
                <p className="hint">Flat light + dark pen = cleanest trace. Raise <b>Threshold</b> if paper texture shows up, lower it if lines break apart.</p>
              )}
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button disabled={!files.length || !!busy} onClick={() => place(false)}>Place on frame {frame + 1}</button>
          {files.length > 1 && (
            <button className="primary" disabled={!!busy} onClick={() => place(true)}>
              Import all {files.length} as sequence
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
