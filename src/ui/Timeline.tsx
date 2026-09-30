import { useState } from 'react'
import { useStore } from '../core/store'
import { keyIndexAt } from '../core/render'
import type { Easing } from '../core/interpolate'

export default function Timeline() {
  const doc = useStore((s) => s.doc)
  const frame = useStore((s) => s.frame)
  const setFrame = useStore((s) => s.setFrame)
  const playing = useStore((s) => s.playing)
  const setPlaying = useStore((s) => s.setPlaying)
  const activeLayerId = useStore((s) => s.activeLayerId)
  const setActiveLayer = useStore((s) => s.setActiveLayer)
  const commit = useStore((s) => s.commit)
  const onion = useStore((s) => s.onion)
  const setOnion = useStore((s) => s.setOnion)
  const interpolate = useStore((s) => s.interpolate)
  const multiframe = useStore((s) => s.multiframe)
  const setMultiframe = useStore((s) => s.setMultiframe)
  const [easing, setEasing] = useState<Easing>('linear')
  const [step, setStep] = useState(1)

  const cell = 18

  const addKey = (dup: boolean) => {
    commit((d) => {
      const l = d.layers.find((x) => x.id === activeLayerId)!
      if (l.keys.some((k) => k.frame === frame)) return
      const prevIdx = keyIndexAt(l, frame)
      const strokes = dup && prevIdx >= 0 ? JSON.parse(JSON.stringify(l.keys[prevIdx].strokes)) : []
      l.keys.push({ frame, strokes })
      l.keys.sort((a, b) => a.frame - b.frame)
    })
  }

  const deleteKey = () => {
    commit((d) => {
      const l = d.layers.find((x) => x.id === activeLayerId)!
      if (l.keys.length <= 1) return
      l.keys = l.keys.filter((k) => k.frame !== frame)
    })
  }

  const moveKey = (layerId: string, from: number, to: number) => {
    if (to < 0 || to >= doc.frameCount) return
    commit((d) => {
      const l = d.layers.find((x) => x.id === layerId)!
      if (l.keys.some((k) => k.frame === to)) return
      const k = l.keys.find((k) => k.frame === from)
      if (!k) return
      k.frame = to
      l.keys.sort((a, b) => a.frame - b.frame)
    })
    setFrame(to)
  }

  return (
    <div className="timeline">
      <div className="tl-bar">
        <button onClick={() => setFrame(0)} title="Jump to start">⏮</button>
        <button onClick={() => setFrame(frame - 1)} title="Previous frame">◀</button>
        <button className="play" onClick={() => setPlaying(!playing)} title="Play / pause (Enter)">
          {playing ? '⏸' : '▶'}
        </button>
        <button onClick={() => setFrame(frame + 1)} title="Next frame">▶|</button>
        <span className="sep" />
        <span className="fnum">
          frame <b>{frame + 1}</b> / {doc.frameCount}
        </span>
        <label className="mini">
          fps
          <input
            type="number"
            min={1}
            max={60}
            value={doc.fps}
            onChange={(e) => commit((d) => void (d.fps = Math.max(1, Math.min(60, +e.target.value || 12))))}
          />
        </label>
        <label className="mini">
          length
          <input
            type="number"
            min={1}
            max={2000}
            value={doc.frameCount}
            onChange={(e) => commit((d) => void (d.frameCount = Math.max(1, Math.min(2000, +e.target.value || 1))))}
          />
        </label>
        <span className="sep" />
        <span className="hgroup" data-tour="keys">
          <button onClick={() => addKey(false)} title="New blank drawing on this frame">+ Key</button>
          <button onClick={() => addKey(true)} title="Copy the current drawing onto this frame">⧉ Dup</button>
          <button onClick={deleteKey} title="Delete the key on this frame">🗑 Key</button>
        </span>
        <span className="sep" />
        <button
          data-tour="interp"
          title="Interpolate Sequence — fill the gap between the surrounding keys with in-betweens"
          onClick={() => {
            const made = interpolate(easing, step)
            if (!made) alert('Put the playhead between two keyframes with at least one empty frame in between.')
          }}
        >
          ⟿ Interpolate
        </button>
        <select value={easing} onChange={(e) => setEasing(e.target.value as Easing)} title="Easing">
          <option value="linear">linear</option>
          <option value="easeIn">ease in</option>
          <option value="easeOut">ease out</option>
          <option value="easeInOut">ease in-out</option>
        </select>
        <input className="tiny" type="number" min={1} max={8} value={step} onChange={(e) => setStep(Math.max(1, +e.target.value || 1))} title="Step: 1 = on ones, 2 = on twos" />
        <span className="sep" />
        <label className="check" title="Onion skin (O)">
          <input type="checkbox" checked={onion.enabled} onChange={(e) => setOnion({ enabled: e.target.checked })} /> Onion
        </label>
        <input type="number" min={0} max={8} value={onion.before} onChange={(e) => setOnion({ before: +e.target.value })} className="tiny" title="Frames before" />
        <input type="number" min={0} max={8} value={onion.after} onChange={(e) => setOnion({ after: +e.target.value })} className="tiny" title="Frames after" />
        <span className="sep" />
        <label className="check" data-tour="multiframe" title="Multiframe editing — brushes and transforms affect neighbouring keys too">
          <input type="checkbox" checked={multiframe.enabled} onChange={(e) => setMultiframe({ enabled: e.target.checked })} /> Multiframe
        </label>
        <input className="tiny" type="number" min={0} max={8} value={multiframe.before} onChange={(e) => setMultiframe({ before: +e.target.value })} title="Keys before" />
        <input className="tiny" type="number" min={0} max={8} value={multiframe.after} onChange={(e) => setMultiframe({ after: +e.target.value })} title="Keys after" />
        <label className="check" title="Weaker effect on further keys">
          <input type="checkbox" checked={multiframe.falloff} onChange={(e) => setMultiframe({ falloff: e.target.checked })} /> falloff
        </label>
      </div>

      <div className="tl-body">
        <div className="tl-names">
          <div className="tl-ruler-spacer" />
          {doc.layers
            .slice()
            .reverse()
            .map((l) => (
              <div key={l.id} className={'tl-name' + (l.id === activeLayerId ? ' active' : '')} onClick={() => setActiveLayer(l.id)}>
                {l.name}
              </div>
            ))}
        </div>

        <div className="tl-scroll">
          <div className="tl-ruler" style={{ width: doc.frameCount * cell }} onPointerDown={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            setFrame(Math.floor((e.clientX - r.left) / cell))
          }}>
            {Array.from({ length: doc.frameCount }).map((_, i) => (
              <div key={i} className={'tick' + (i % 5 === 0 ? ' major' : '')} style={{ left: i * cell, width: cell }}>
                {i % 5 === 0 ? i + 1 : ''}
              </div>
            ))}
            <div className="playhead" style={{ left: frame * cell }} />
          </div>

          {doc.layers
            .slice()
            .reverse()
            .map((l) => (
              <div key={l.id} className={'tl-track' + (l.id === activeLayerId ? ' active' : '')} style={{ width: doc.frameCount * cell }}>
                {Array.from({ length: doc.frameCount }).map((_, i) => {
                  const isKey = l.keys.some((k) => k.frame === i)
                  const held = !isKey && keyIndexAt(l, i) >= 0
                  return (
                    <div
                      key={i}
                      className={'cell' + (isKey ? ' key' : '') + (held ? ' held' : '') + (i === frame ? ' cur' : '')}
                      style={{ left: i * cell, width: cell }}
                      onPointerDown={() => {
                        setActiveLayer(l.id)
                        setFrame(i)
                      }}
                      onDoubleClick={() => isKey && moveKey(l.id, i, i + 1)}
                      title={isKey ? 'Keyframe — double-click to nudge right' : ''}
                    />
                  )
                })}
                <div className="playhead thin" style={{ left: frame * cell }} />
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
