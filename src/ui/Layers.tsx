import { useStore, newLayer } from '../core/store'

export default function Layers() {
  const doc = useStore((s) => s.doc)
  const activeLayerId = useStore((s) => s.activeLayerId)
  const setActiveLayer = useStore((s) => s.setActiveLayer)
  const commit = useStore((s) => s.commit)

  const idx = doc.layers.findIndex((l) => l.id === activeLayerId)

  return (
    <div className="panel layers">
      <div className="panel-head">
        <h3>Layers</h3>
        <div className="hgroup">
          <button
            title="Add layer"
            onClick={() => {
              const l = newLayer(`Layer ${doc.layers.length + 1}`)
              commit((d) => void d.layers.push(l))
              setActiveLayer(l.id)
            }}
          >
            ＋
          </button>
          <button
            title="Duplicate layer"
            onClick={() =>
              commit((d) => {
                const src = d.layers.find((l) => l.id === activeLayerId)
                if (!src) return
                const copy = JSON.parse(JSON.stringify(src))
                copy.id = Math.random().toString(36).slice(2, 10)
                copy.name = src.name + ' copy'
                d.layers.push(copy)
              })
            }
          >
            ⧉
          </button>
          <button title="Move up" onClick={() => commit((d) => { if (idx < d.layers.length - 1) { const [l] = d.layers.splice(idx, 1); d.layers.splice(idx + 1, 0, l) } })}>↑</button>
          <button title="Move down" onClick={() => commit((d) => { if (idx > 0) { const [l] = d.layers.splice(idx, 1); d.layers.splice(idx - 1, 0, l) } })}>↓</button>
          <button
            title="Delete layer"
            onClick={() =>
              commit((d) => {
                if (d.layers.length <= 1) return
                d.layers = d.layers.filter((l) => l.id !== activeLayerId)
              })
            }
          >
            🗑
          </button>
        </div>
      </div>

      <div className="layer-list">
        {doc.layers
          .slice()
          .reverse()
          .map((l) => (
            <div key={l.id} className={'layer' + (l.id === activeLayerId ? ' active' : '')} onClick={() => setActiveLayer(l.id)}>
              <button
                className="icon"
                title="Visible"
                onClick={(e) => {
                  e.stopPropagation()
                  commit((d) => void (d.layers.find((x) => x.id === l.id)!.visible = !l.visible))
                }}
              >
                {l.visible ? '👁' : '🚫'}
              </button>
              <button
                className="icon"
                title="Lock"
                onClick={(e) => {
                  e.stopPropagation()
                  commit((d) => void (d.layers.find((x) => x.id === l.id)!.locked = !l.locked))
                }}
              >
                {l.locked ? '🔒' : '🔓'}
              </button>
              <input
                className="lname"
                value={l.name}
                onChange={(e) => commit((d) => void (d.layers.find((x) => x.id === l.id)!.name = e.target.value))}
              />
              <button
                className={'icon' + (l.onion ? ' on' : '')}
                title="Use onion skin on this layer"
                onClick={(e) => {
                  e.stopPropagation()
                  commit((d) => void (d.layers.find((x) => x.id === l.id)!.onion = !l.onion))
                }}
              >
                🧅
              </button>
            </div>
          ))}
      </div>

      {idx >= 0 && (
        <div className="opts">
          <div className="row">
            <label>Opacity</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={doc.layers[idx].opacity}
              onChange={(e) => commit((d) => void (d.layers[idx].opacity = +e.target.value))}
            />
            <span className="num">{Math.round(doc.layers[idx].opacity * 100)}</span>
          </div>
          <div className="row">
            <label>Blend</label>
            <select
              value={doc.layers[idx].blend ?? 'normal'}
              onChange={(e) => commit((d) => void (d.layers[idx].blend = e.target.value as any))}
            >
              {['normal', 'multiply', 'screen', 'overlay', 'lighten', 'darken', 'difference'].map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="row">
            <label>Tint</label>
            <input
              type="color"
              value={doc.layers[idx].tint ?? '#000000'}
              onChange={(e) => commit((d) => void (d.layers[idx].tint = e.target.value))}
            />
            <button className="mini-btn" onClick={() => commit((d) => void (d.layers[idx].tint = null))}>clear</button>
          </div>
        </div>
      )}
    </div>
  )
}
