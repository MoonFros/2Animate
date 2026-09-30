import { useState } from 'react'
import { useStore, newLayer } from '../core/store'
import { MODIFIER_LABELS, defaultModifier, type Modifier, type ModifierKind } from '../core/modifiers'

export default function Layers() {
  const doc = useStore((s) => s.doc)
  const activeLayerId = useStore((s) => s.activeLayerId)
  const setActiveLayer = useStore((s) => s.setActiveLayer)
  const commit = useStore((s) => s.commit)

  const idx = doc.layers.findIndex((l) => l.id === activeLayerId)
  const [tab, setTab] = useState<'layer' | 'modifiers'>('layer')
  const layer = idx >= 0 ? doc.layers[idx] : null
  const tr = layer?.transform ?? { x: 0, y: 0, rot: 0, scale: 1 }

  const setTransform = (patch: Partial<typeof tr>) =>
    commit((d) => {
      const l = d.layers[idx]
      l.transform = { ...{ x: 0, y: 0, rot: 0, scale: 1 }, ...l.transform, ...patch }
    })

  const setMod = (id: string, patch: Partial<Modifier>) =>
    commit((d) => {
      const m = d.layers[idx].modifiers?.find((x) => x.id === id)
      if (m) Object.assign(m, patch)
    })

  const numRow = (label: string, value: number, on: (v: number) => void, min: number, max: number, step = 1) => (
    <div className="row" key={label}>
      <label>{label}</label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => on(+e.target.value)} />
      <span className="num">{Math.round(value * 100) / 100}</span>
    </div>
  )

  return (
    <div className="panel layers" data-tour="layers">
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

      {layer && (
        <div className="tabs pad">
          <button className={tab === 'layer' ? 'on' : ''} onClick={() => setTab('layer')}>Layer</button>
          <button className={tab === 'modifiers' ? 'on' : ''} onClick={() => setTab('modifiers')}>
            Modifiers{layer.modifiers?.length ? ` (${layer.modifiers.length})` : ''}
          </button>
        </div>
      )}

      {layer && tab === 'modifiers' && (
        <div className="opts">
          <div className="row">
            <select
              value=""
              onChange={(e) => {
                const kind = e.target.value as ModifierKind
                if (!kind) return
                commit((d) => {
                  const l = d.layers[idx]
                  l.modifiers = [...(l.modifiers ?? []), defaultModifier(kind)]
                })
              }}
            >
              <option value="">＋ Add modifier…</option>
              {(Object.keys(MODIFIER_LABELS) as ModifierKind[]).map((k) => (
                <option key={k} value={k}>{MODIFIER_LABELS[k]}</option>
              ))}
            </select>
          </div>

          {(layer.modifiers ?? []).map((m) => (
            <div className="mod" key={m.id}>
              <div className="mod-head">
                <input type="checkbox" checked={m.enabled} onChange={(e) => setMod(m.id, { enabled: e.target.checked })} />
                <b>{MODIFIER_LABELS[m.kind]}</b>
                <button
                  className="mini-btn"
                  onClick={() =>
                    commit((d) => {
                      d.layers[idx].modifiers = (d.layers[idx].modifiers ?? []).filter((x) => x.id !== m.id)
                    })
                  }
                >
                  ✕
                </button>
              </div>
              {m.kind === 'noise' && (
                <>
                  {numRow('Amount', m.factor ?? 6, (v) => setMod(m.id, { factor: v }), 0, 40, 0.5)}
                  {numRow('Detail', m.scale ?? 1, (v) => setMod(m.id, { scale: v }), 0.1, 6, 0.1)}
                  {numRow('Step', m.step ?? 2, (v) => setMod(m.id, { step: v }), 1, 12)}
                  {numRow('Thickness', m.thicknessFactor ?? 0.2, (v) => setMod(m.id, { thicknessFactor: v }), 0, 1, 0.05)}
                </>
              )}
              {m.kind === 'offset' && (
                <>
                  {numRow('X', m.x ?? 0, (v) => setMod(m.id, { x: v }), -800, 800)}
                  {numRow('Y', m.y ?? 0, (v) => setMod(m.id, { y: v }), -800, 800)}
                  {numRow('Rotate', m.rot ?? 0, (v) => setMod(m.id, { rot: v }), -180, 180)}
                  {numRow('Scale X', m.scaleX ?? 1, (v) => setMod(m.id, { scaleX: v }), 0.1, 3, 0.05)}
                  {numRow('Scale Y', m.scaleY ?? 1, (v) => setMod(m.id, { scaleY: v }), 0.1, 3, 0.05)}
                </>
              )}
              {m.kind === 'thickness' && (
                <>
                  <div className="row">
                    <label>Mode</label>
                    <select value={m.mode ?? 'multiply'} onChange={(e) => setMod(m.id, { mode: e.target.value as any })}>
                      <option value="multiply">multiply</option>
                      <option value="add">add</option>
                    </select>
                  </div>
                  {numRow('Amount', m.amount ?? 1.4, (v) => setMod(m.id, { amount: v }), m.mode === 'add' ? -20 : 0.1, m.mode === 'add' ? 40 : 6, 0.05)}
                </>
              )}
              {m.kind === 'build' && (
                <>
                  <div className="row">
                    <label>Mode</label>
                    <select value={m.buildMode ?? 'sequential'} onChange={(e) => setMod(m.id, { buildMode: e.target.value as any })}>
                      <option value="sequential">sequential</option>
                      <option value="concurrent">concurrent</option>
                    </select>
                  </div>
                  {numRow('Start', m.start ?? 0, (v) => setMod(m.id, { start: v }), 0, 240)}
                  {numRow('Length', m.length ?? 12, (v) => setMod(m.id, { length: v }), 1, 240)}
                  <label className="check">
                    <input type="checkbox" checked={!!m.reverse} onChange={(e) => setMod(m.id, { reverse: e.target.checked })} /> Reverse
                  </label>
                </>
              )}
              {m.kind === 'tint' && (
                <>
                  <div className="row">
                    <label>Colour</label>
                    <input type="color" value={m.color ?? '#3aa0ff'} onChange={(e) => setMod(m.id, { color: e.target.value })} />
                  </div>
                  {numRow('Strength', m.strength ?? 0.5, (v) => setMod(m.id, { strength: v }), 0, 1, 0.05)}
                </>
              )}
              {m.kind === 'simplify' && numRow('Distance', m.tolerance ?? 2, (v) => setMod(m.id, { tolerance: v }), 0.5, 40, 0.5)}
            </div>
          ))}
          {!layer.modifiers?.length && <p className="hint">Modifiers change how the layer draws without touching your strokes. Try <b>Noise</b> for hand-drawn boil or <b>Build</b> for draw-on animation.</p>}
        </div>
      )}

      {idx >= 0 && tab === 'layer' && (
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

          <div className="group-label">Transform</div>
          {numRow('X', tr.x, (v) => setTransform({ x: v }), -1000, 1000)}
          {numRow('Y', tr.y, (v) => setTransform({ y: v }), -1000, 1000)}
          {numRow('Rotate', tr.rot, (v) => setTransform({ rot: v }), -180, 180)}
          {numRow('Scale', tr.scale, (v) => setTransform({ scale: v }), 0.1, 4, 0.05)}
          <div className="row">
            <label>Parent</label>
            <select
              value={layer?.parent ?? ''}
              onChange={(e) => commit((d) => void (d.layers[idx].parent = e.target.value || null))}
            >
              <option value="">— none —</option>
              {doc.layers.filter((l) => l.id !== layer?.id).map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          <div className="group-label">Mask</div>
          <div className="row">
            <label>Use layer</label>
            <select
              value={layer?.maskWith ?? ''}
              onChange={(e) => commit((d) => void (d.layers[idx].maskWith = e.target.value || null))}
            >
              <option value="">— none —</option>
              {doc.layers.filter((l) => l.id !== layer?.id).map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <label className="check">
            <input type="checkbox" checked={!!layer?.maskInvert} onChange={(e) => commit((d) => void (d.layers[idx].maskInvert = e.target.checked))} /> Invert mask
          </label>
        </div>
      )}
    </div>
  )
}
