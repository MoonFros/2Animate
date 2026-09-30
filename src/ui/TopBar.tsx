import { useEffect, useRef, useState } from 'react'
import { useStore } from '../core/store'
import { download, exportPNGSequence, exportSVG, exportVideo, renderFrameToCanvas } from '../core/exporters'
import type { Doc } from '../core/types'

export default function TopBar({ onImport, onHelp }: { onImport: () => void; onHelp: () => void }) {
  const doc = useStore((s) => s.doc)
  const frame = useStore((s) => s.frame)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const loadDoc = useStore((s) => s.loadDoc)
  const commit = useStore((s) => s.commit)
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const [busy, setBusy] = useState('')
  const [menu, setMenu] = useState<'scene' | 'export' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const barRef = useRef<HTMLDivElement>(null)

  // click-outside closes the menus (hover menus vanished the moment the OS
  // colour picker stole focus, which is why the background looked unchangeable)
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setMenu(null)
    }
    window.addEventListener('pointerdown', away)
    return () => window.removeEventListener('pointerdown', away)
  }, [])

  const BG_PRESETS: [string, string][] = [
    ['#ffffff', 'white'],
    ['#f6efe2', 'paper'],
    ['#111111', 'black'],
    ['#1e2a3a', 'night'],
    ['transparent', 'none'],
  ]

  const save = () => download(new Blob([JSON.stringify(doc)], { type: 'application/json' }), 'scene.2animate.json')

  const open = async (f: File | undefined) => {
    if (!f) return
    const d = JSON.parse(await f.text()) as Doc
    if (!d.layers) return alert('That does not look like a 2Animate scene.')
    loadDoc(d)
  }

  const exportPNG = async () => {
    setBusy('rendering PNGs…')
    const zip = await exportPNGSequence(doc, (n, t) => setBusy(`rendering ${n}/${t}…`))
    download(zip, 'frames.zip')
    setBusy('')
  }

  const exportWebm = async () => {
    setBusy('recording…')
    const blob = await exportVideo(doc, (n, t) => setBusy(`recording ${n}/${t}…`))
    download(blob, 'animation.webm')
    setBusy('')
  }

  return (
    <div className="topbar" ref={barRef}>
      <div className="brand">
        2<span>Animate</span>
      </div>
      <button onClick={onImport} className="primary" data-tour="import">📷 Import paper drawing</button>
      <span className="sep" />
      <button onClick={undo} title="Ctrl+Z">↶</button>
      <button onClick={redo} title="Ctrl+Shift+Z">↷</button>
      <span className="sep" />
      <button onClick={() => setView({ zoom: 1, x: 0, y: 0 })} title="Reset view">⤢ {Math.round(view.zoom * 100)}%</button>
      <span className="sep" />
      <div className={'menu' + (menu === 'scene' ? ' open' : '')}>
        <button onClick={() => setMenu(menu === 'scene' ? null : 'scene')}>Scene ▾</button>
        <div className="drop-menu">
          <button onClick={save}>Save scene (.json)</button>
          <button onClick={() => fileRef.current?.click()}>Open scene…</button>
          <hr />
          <label className="menu-row">
            Canvas
            <input type="number" value={doc.width} onChange={(e) => commit((d) => void (d.width = Math.max(64, +e.target.value || 64)))} />
            ×
            <input type="number" value={doc.height} onChange={(e) => commit((d) => void (d.height = Math.max(64, +e.target.value || 64)))} />
          </label>
          <div className="menu-row col">
            <span>Background</span>
            <div className="swatches">
              {BG_PRESETS.map(([c, name]) => (
                <button
                  key={c}
                  className={'sw' + (doc.bg === c ? ' on' : '') + (c === 'transparent' ? ' none' : '')}
                  style={c === 'transparent' ? undefined : { background: c }}
                  title={name}
                  onClick={() => commit((d) => void (d.bg = c))}
                />
              ))}
              <input
                type="color"
                value={doc.bg === 'transparent' ? '#ffffff' : doc.bg}
                onChange={(e) => commit((d) => void (d.bg = e.target.value))}
                title="Custom background colour"
              />
            </div>
            <small className="dim">“none” = transparent, exports PNG/SVG with alpha.</small>
          </div>
        </div>
      </div>
      <div className={'menu' + (menu === 'export' ? ' open' : '')} data-tour="export">
        <button onClick={() => setMenu(menu === 'export' ? null : 'export')}>Export ▾</button>
        <div className="drop-menu">
          <button onClick={() => download(new Blob([]), '')} style={{ display: 'none' }} />
          <button
            onClick={() =>
              renderFrameToCanvas(doc, frame, 2).toBlob((b) => b && download(b, `frame_${frame + 1}.png`), 'image/png')
            }
          >
            Current frame → PNG
          </button>
          <button onClick={() => download(exportSVG(doc, frame), `frame_${frame + 1}.svg`)}>Current frame → SVG (vector)</button>
          <button onClick={exportPNG}>All frames → PNG sequence (.zip)</button>
          <button onClick={exportWebm}>Animation → WebM video</button>
        </div>
      </div>
      <span className="sep" />
      <button onClick={onHelp} title="Tutorial & shortcuts">? Help</button>
      {busy && <span className="busy">{busy}</span>}
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => open(e.target.files?.[0])} />
    </div>
  )
}
