import { useEffect, useState } from 'react'
import { useStore } from '../core/store'
import { isSculpt, type ToolId } from '../core/types'

const DRAW_TOOLS: { id: ToolId; label: string; icon: string; key: string }[] = [
  { id: 'draw', label: 'Draw', icon: '✏️', key: 'D' },
  { id: 'line', label: 'Straight line', icon: '📏', key: 'L' },
  { id: 'fill', label: 'Fill / bucket', icon: '🪣', key: 'F' },
  { id: 'erase', label: 'Erase', icon: '🧽', key: 'E' },
  { id: 'select', label: 'Edit: select, G/R/S transform', icon: '⬚', key: 'V' },
  { id: 'pan', label: 'Pan (or hold space)', icon: '🤚', key: 'Space' },
]

const SCULPT_LIST: { id: ToolId; label: string; icon: string; key: string }[] = [
  { id: 'smooth', label: 'Smooth', icon: '〰️', key: 'S' },
  { id: 'thickness', label: 'Thickness', icon: '🖊️', key: 'T' },
  { id: 'strength', label: 'Strength (opacity)', icon: '◐', key: 'U' },
  { id: 'randomize', label: 'Randomize', icon: '🎲', key: 'N' },
  { id: 'grab', label: 'Grab', icon: '✋', key: 'G' },
  { id: 'push', label: 'Push / smear', icon: '👉', key: 'P' },
  { id: 'twist', label: 'Twist', icon: '🌀', key: 'W' },
  { id: 'pinch', label: 'Pinch / inflate', icon: '🤏', key: 'I' },
  { id: 'tint', label: 'Tint / vertex paint', icon: '🎨', key: 'C' },
]

const SWATCHES = ['#111111', '#ffffff', '#e8453c', '#f2a03d', '#f7e733', '#4caf50', '#3aa0ff', '#8e5cff', '#8d5524', '#7a7a7a']

export default function Toolbar() {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const brush = useStore((s) => s.brush)
  const setBrush = useStore((s) => s.setBrush)
  const eraser = useStore((s) => s.eraser)
  const setEraser = useStore((s) => s.setEraser)
  const sculpt = useStore((s) => s.sculpt)
  const setSculpt = useStore((s) => s.setSculpt)
  const fill = useStore((s) => s.fill)
  const setFill = useStore((s) => s.setFill)
  const strokeOp = useStore((s) => s.strokeOp)
  const selection = useStore((s) => s.selection)
  const multiframe = useStore((s) => s.multiframe)

  const [palette, setPalette] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('2animate.palette') || '[]')
    } catch {
      return []
    }
  })
  useEffect(() => localStorage.setItem('2animate.palette', JSON.stringify(palette)), [palette])

  return (
    <div className="toolbar">
      <div className="tool-group">
        <div className="group-label">Draw</div>
        <div className="tools">
          {DRAW_TOOLS.map((t) => (
            <button key={t.id} className={'tool' + (tool === t.id ? ' active' : '')} onClick={() => setTool(t.id)} title={`${t.label} (${t.key})`}>
              {t.icon}
            </button>
          ))}
        </div>
        <div className="group-label">Sculpt</div>
        <div className="tools">
          {SCULPT_LIST.map((t) => (
            <button key={t.id} className={'tool' + (tool === t.id ? ' active' : '')} onClick={() => setTool(t.id)} title={`${t.label} (${t.key}) — hold Alt to invert`}>
              {t.icon}
            </button>
          ))}
        </div>
      </div>

      <div className="opts">
        {(tool === 'draw' || tool === 'line') && (
          <>
            <div className="row">
              <label>Size</label>
              <input type="range" min={1} max={60} step={0.5} value={brush.width} onChange={(e) => setBrush({ width: +e.target.value })} />
              <span className="num">{brush.width.toFixed(1)}</span>
            </div>
            <div className="row">
              <label>Opacity</label>
              <input type="range" min={0.05} max={1} step={0.05} value={brush.opacity} onChange={(e) => setBrush({ opacity: +e.target.value })} />
              <span className="num">{Math.round(brush.opacity * 100)}</span>
            </div>
            <div className="row">
              <label>Stabilize</label>
              <input type="range" min={0} max={0.95} step={0.05} value={brush.stabilize} onChange={(e) => setBrush({ stabilize: +e.target.value })} />
              <span className="num">{Math.round(brush.stabilize * 100)}</span>
            </div>
            <label className="check">
              <input type="checkbox" checked={brush.taper} onChange={(e) => setBrush({ taper: e.target.checked })} /> Taper ends
            </label>
            <div className="swatches">
              {SWATCHES.map((c) => (
                <button key={c} className={'sw' + (brush.color === c ? ' on' : '')} style={{ background: c }} onClick={() => setBrush({ color: c })} />
              ))}
              <input type="color" value={brush.color} onChange={(e) => setBrush({ color: e.target.value })} />
            </div>
          </>
        )}

        {tool === 'fill' && (
          <>
            <div className="row">
              <label>Colour</label>
              <input type="color" value={fill.color} onChange={(e) => setFill({ color: e.target.value })} />
            </div>
            <div className="swatches">
              {SWATCHES.map((c) => (
                <button key={c} className={'sw' + (fill.color === c ? ' on' : '')} style={{ background: c }} onClick={() => setFill({ color: c })} />
              ))}
            </div>
            <div className="row">
              <label>Leak size</label>
              <input type="range" min={0} max={20} value={fill.leak} onChange={(e) => setFill({ leak: +e.target.value })} />
              <span className="num">{fill.leak}</span>
            </div>
            <div className="row">
              <label>Expand</label>
              <input type="range" min={0} max={12} value={fill.expand} onChange={(e) => setFill({ expand: +e.target.value })} />
              <span className="num">{fill.expand}</span>
            </div>
            <div className="row">
              <label>Smooth</label>
              <input type="range" min={0} max={0.9} step={0.05} value={fill.smooth} onChange={(e) => setFill({ smooth: +e.target.value })} />
              <span className="num">{fill.smooth.toFixed(2)}</span>
            </div>
            <p className="hint">Click inside an enclosed area. Raise <b>Leak size</b> if colour escapes through gaps in the lines.</p>
          </>
        )}

        {tool === 'erase' && (
          <>
            <div className="row">
              <label>Radius</label>
              <input type="range" min={2} max={120} value={eraser.radius} onChange={(e) => setEraser({ radius: +e.target.value })} />
              <span className="num">{eraser.radius}</span>
            </div>
            <label className="check">
              <input type="checkbox" checked={eraser.whole} onChange={(e) => setEraser({ whole: e.target.checked })} /> Delete whole stroke
            </label>
          </>
        )}

        {isSculpt(tool) && (
          <>
            {tool === 'tint' && (
              <div className="swatches">
                {SWATCHES.map((c) => (
                  <button key={c} className={'sw' + (brush.color === c ? ' on' : '')} style={{ background: c }} onClick={() => setBrush({ color: c })} />
                ))}
                <input type="color" value={brush.color} onChange={(e) => setBrush({ color: e.target.value })} />
              </div>
            )}
            <div className="row">
              <label>Radius</label>
              <input type="range" min={10} max={400} value={sculpt.radius} onChange={(e) => setSculpt({ radius: +e.target.value })} />
              <span className="num">{sculpt.radius}</span>
            </div>
            <div className="row">
              <label>Strength</label>
              <input type="range" min={0.05} max={1} step={0.05} value={sculpt.strength} onChange={(e) => setSculpt({ strength: +e.target.value })} />
              <span className="num">{Math.round(sculpt.strength * 100)}</span>
            </div>
            <label className="check">
              <input type="checkbox" checked={sculpt.maskSelected} onChange={(e) => setSculpt({ maskSelected: e.target.checked })} /> Affect selection only
            </label>
            <p className="hint">Hold <b>Alt</b> to invert the brush (thin, fade, inflate, untwist, wipe tint).</p>
            {multiframe.enabled && <p className="hint accent">Multiframe editing is ON — {multiframe.before} key(s) before and {multiframe.after} after are being sculpted too.</p>}
          </>
        )}

        {tool === 'select' && (
          <p className="hint">
            Click a line or drag a box. Then <b>G</b> move, <b>R</b> rotate, <b>S</b> scale — <b>X</b>/<b>Y</b> to lock an axis, click or Enter to
            confirm, Esc to cancel. Ctrl+A selects all.
          </p>
        )}

        <div className="group-label">My palette</div>
        <div className="swatches">
          {palette.map((c) => (
            <button
              key={c}
              className={'sw' + (brush.color === c ? ' on' : '')}
              style={{ background: c }}
              onClick={() => setBrush({ color: c })}
              onContextMenu={(e) => {
                e.preventDefault()
                setPalette(palette.filter((x) => x !== c))
              }}
              title="Click to use, right-click to remove"
            />
          ))}
          <button className="sw add" onClick={() => setPalette([...new Set([...palette, brush.color])].slice(-24))} title="Save current colour">
            ＋
          </button>
        </div>

        <div className="group-label">Stroke {selection.length ? `(${selection.length} selected)` : '(all)'}</div>
        <div className="op-grid">
          <button onClick={() => strokeOp('smooth')}>Smooth</button>
          <button onClick={() => strokeOp('simplify')}>Simplify</button>
          <button onClick={() => strokeOp('subdivide')}>Subdivide</button>
          <button onClick={() => strokeOp('cyclic')}>Cyclic</button>
          <button onClick={() => strokeOp('reverse')}>Reverse</button>
          <button onClick={() => strokeOp('flipX')}>Flip H</button>
          <button onClick={() => strokeOp('flipY')}>Flip V</button>
          <button onClick={() => strokeOp('front')}>To front</button>
          <button onClick={() => strokeOp('back')}>To back</button>
        </div>
      </div>
    </div>
  )
}
