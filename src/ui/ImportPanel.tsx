import { useEffect, useRef, useState } from 'react'
import { traceImage, defaultTraceOptions, type TraceOptions } from '../core/vectorize'
import type { Stroke } from '../core/types'
import { useStore } from '../core/store'
import { uid } from '../core/types'

interface Loaded {
  name: string
  img: HTMLImageElement
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
  const [busy, setBusy] = useState('')
  const [preview, setPreview] = useState<{ strokes: Stroke[]; w: number; h: number } | null>(null)
  const [spacing, setSpacing] = useState(2)
  const [showMask, setShowMask] = useState(false)
  const [maskUrl, setMaskUrl] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const doc = useStore((s) => s.doc)
  const commit = useStore((s) => s.commit)
  const frame = useStore((s) => s.frame)
  const activeLayerId = useStore((s) => s.activeLayerId)

  const load = async (list: FileList | null) => {
    if (!list?.length) return
    const out: Loaded[] = []
    for (const f of Array.from(list)) {
      const url = URL.createObjectURL(f)
      const img = new Image()
      await new Promise((res, rej) => {
        img.onload = res
        img.onerror = rej
        img.src = url
      })
      out.push({ name: f.name, img })
    }
    out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    setFiles(out)
    setActive(0)
  }

  // retrace the visible image whenever settings change
  useEffect(() => {
    const f = files[active]
    if (!f) {
      setPreview(null)
      return
    }
    let cancelled = false
    setBusy('tracing…')
    const t = setTimeout(() => {
      const res = traceImage(f.img, f.img.naturalWidth, f.img.naturalHeight, opts)
      if (cancelled) return
      setPreview({ strokes: res.strokes, w: res.width, h: res.height })
      setMaskUrl(res.maskUrl)
      setBusy('')
    }, 60)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [files, active, opts])

  // draw preview
  useEffect(() => {
    const c = canvasRef.current
    if (!c || !preview) return
    const W = 460
    const H = Math.round((W * preview.h) / preview.w)
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
      ctx.lineWidth = st.width
      ctx.beginPath()
      st.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.stroke()
    }
    ctx.restore()
  }, [preview])

  const place = async (asSequence: boolean) => {
    if (!files.length) return
    setBusy('placing…')
    const batch: { frame: number; strokes: Stroke[] }[] = []
    const targets = asSequence ? files : [files[active]]
    for (let i = 0; i < targets.length; i++) {
      const f = targets[i]
      const res = traceImage(f.img, f.img.naturalWidth, f.img.naturalHeight, opts)
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
              <input type="file" accept="image/*" multiple onChange={(e) => load(e.target.files)} />
              <span>📷 Choose photos / scans</span>
              <small>Pick several at once to import a whole flipbook as a sequence</small>
            </label>
            <label className="drop cam">
              <input type="file" accept="image/*" capture="environment" onChange={(e) => load(e.target.files)} />
              <span>Use phone camera</span>
            </label>

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
                <input type="range" min={0} max={120} step={1} value={opts.minArea} onChange={(e) => setOpts({ ...opts, minArea: +e.target.value })} />
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
              <span>{busy || `${preview?.strokes.length ?? 0} strokes`}</span>
              <label className="check">
                <input type="checkbox" checked={showMask} onChange={(e) => setShowMask(e.target.checked)} /> show ink mask
              </label>
            </div>
            <div className="preview">
              {showMask && maskUrl ? <img src={maskUrl} alt="mask" /> : <canvas ref={canvasRef} />}
            </div>
            <p className="hint">
              Flat, even light and a dark pen give the cleanest trace. Push <b>Threshold</b> up if paper texture comes through, down if lines break up.
            </p>
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
