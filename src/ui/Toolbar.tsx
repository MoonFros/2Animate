import { useStore } from '../core/store'
import type { ToolId } from '../core/types'

const TOOLS: { id: ToolId; label: string; icon: string; key: string }[] = [
  { id: 'draw', label: 'Draw', icon: '✏️', key: 'D' },
  { id: 'line', label: 'Straight line', icon: '📏', key: 'L' },
  { id: 'erase', label: 'Erase', icon: '🧽', key: 'E' },
  { id: 'smooth', label: 'Smooth', icon: '〰️', key: 'S' },
  { id: 'thickness', label: 'Thickness (alt = thin)', icon: '🖊️', key: 'T' },
  { id: 'grab', label: 'Grab / push', icon: '✋', key: 'G' },
  { id: 'select', label: 'Select & move', icon: '⬚', key: 'V' },
  { id: 'pan', label: 'Pan (or hold space)', icon: '🤚', key: 'Space' },
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

  return (
    <div className="toolbar">
      <div className="tools">
        {TOOLS.map((t) => (
          <button key={t.id} className={'tool' + (tool === t.id ? ' active' : '')} onClick={() => setTool(t.id)} title={`${t.label} (${t.key})`}>
            <span>{t.icon}</span>
          </button>
        ))}
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

        {(tool === 'smooth' || tool === 'thickness' || tool === 'grab') && (
          <>
            <div className="row">
              <label>Radius</label>
              <input type="range" min={10} max={300} value={sculpt.radius} onChange={(e) => setSculpt({ radius: +e.target.value })} />
              <span className="num">{sculpt.radius}</span>
            </div>
            <div className="row">
              <label>Strength</label>
              <input type="range" min={0.05} max={1} step={0.05} value={sculpt.strength} onChange={(e) => setSculpt({ strength: +e.target.value })} />
              <span className="num">{Math.round(sculpt.strength * 100)}</span>
            </div>
            {tool === 'thickness' && <p className="hint">Hold Alt to thin lines instead.</p>}
          </>
        )}

        {tool === 'select' && <p className="hint">Click a line or drag a box. Drag to move, Delete to remove.</p>}
      </div>
    </div>
  )
}
