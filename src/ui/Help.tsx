import { useState } from 'react'

const SHORTCUTS: [string, string][] = [
  ['D / B', 'Draw'],
  ['L', 'Straight line'],
  ['F', 'Fill / bucket'],
  ['E', 'Erase'],
  ['V', 'Select (edit mode)'],
  ['S / T / U / N', 'Sculpt: smooth, thickness, strength, randomize'],
  ['G / P / W / I / C', 'Sculpt: grab, push, twist, pinch, tint'],
  ['Alt (hold)', 'Invert the active sculpt brush'],
  ['G / R / S', 'Move / rotate / scale the selection'],
  ['X / Y', 'Lock the transform to an axis'],
  ['Enter / Esc', 'Confirm / cancel a transform'],
  ['Ctrl+A', 'Select everything on the frame'],
  ['Delete', 'Delete the selection'],
  ['O', 'Toggle onion skin'],
  ['← / →', 'Previous / next frame'],
  ['Enter', 'Play / pause'],
  ['Space (hold)', 'Pan the canvas'],
  ['Wheel', 'Zoom'],
  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
]

export default function Help({ onClose, onTour }: { onClose: () => void; onTour: () => void }) {
  const [tab, setTab] = useState<'start' | 'photo' | 'keys' | 'about'>('start')

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal help">
        <div className="modal-head">
          <h2>How to use 2Animate</h2>
          <button onClick={onClose}>✕</button>
        </div>

        <div className="tabs pad">
          <button className={tab === 'start' ? 'on' : ''} onClick={() => setTab('start')}>Quick start</button>
          <button className={tab === 'photo' ? 'on' : ''} onClick={() => setTab('photo')}>Photo tips</button>
          <button className={tab === 'keys' ? 'on' : ''} onClick={() => setTab('keys')}>Shortcuts</button>
          <button className={tab === 'about' ? 'on' : ''} onClick={() => setTab('about')}>What's included</button>
        </div>

        <div className="modal-body help-body">
          {tab === 'start' && (
            <div className="guide">
              <h4>Make your first animation from paper</h4>
              <ol>
                <li>
                  Draw your poses on paper — one drawing per sheet, dark pen, no shading. Number them in a corner so
                  they sort correctly.
                </li>
                <li>
                  Photograph them from directly above in even light. Press <b>📷 Import paper drawing</b> and select them
                  all at once.
                </li>
                <li>
                  On the <b>Crop</b> tab drag a box around the paper. Check the <b>Vector</b> tab — that is exactly what
                  you will get. Tune <b>Threshold</b> and <b>Detail</b> until it looks right.
                </li>
                <li>
                  Set <b>Frames apart</b> (2 = animating "on twos") and press <b>Import all as sequence</b>. You now have
                  keyframes.
                </li>
                <li>
                  Press <b>▶</b> to play. Turn on <b>Onion</b> to see neighbouring drawings while you fix things.
                </li>
                <li>
                  Clean up with the <b>Smooth</b> sculpt brush, colour with <b>Fill</b>, add in-betweens with
                  <b> ⟿ Interpolate</b>.
                </li>
                <li>
                  Export via <b>Export ▾</b> — WebM video, PNG sequence, or SVG if you want to take the vectors into
                  Blender or Inkscape.
                </li>
              </ol>
              <p className="dim">Tip: keep line art and colour on separate layers, and put the colour layer underneath.</p>
            </div>
          )}

          {tab === 'photo' && (
            <div className="guide">
              <h4>Getting a clean trace</h4>
              <ul>
                <li><b>Light it evenly.</b> Near a window, no lamp glare, no hard shadow across the page. The app flattens uneven light, but flat light is still better.</li>
                <li><b>Shoot straight down.</b> Angled photos skew the drawing; the crop box can't fix perspective.</li>
                <li><b>Dark pen beats pencil.</b> A fineliner or gel pen traces far more reliably than light graphite. If you must use pencil, press hard and raise <b>Threshold</b>.</li>
                <li><b>Don't shade.</b> The tracer wants lines, not tone. Grey washes become messy blobs.</li>
                <li><b>Fill the frame</b> with the paper and crop tightly — more pixels on the drawing means finer detail.</li>
                <li><b>Registration:</b> keep the paper in the same spot for every shot, or draw a small cross in two corners so you can line drawings up afterwards.</li>
                <li><b>Speckles?</b> Raise <b>Despeckle</b>. <b>Broken lines?</b> Lower <b>Threshold</b> or raise <b>Quality</b>.</li>
              </ul>
            </div>
          )}

          {tab === 'keys' && (
            <div className="guide">
              <table className="keys">
                <tbody>
                  {SHORTCUTS.map(([k, v]) => (
                    <tr key={k}>
                      <td><kbd>{k}</kbd></td>
                      <td>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'about' && (
            <div className="guide">
              <h4>Grease Pencil features that made it in</h4>
              <ul>
                <li><b>Draw:</b> brush with stabiliser, pressure, taper; straight line; fill with leak closing; eraser (soft split or whole stroke)</li>
                <li><b>Sculpt:</b> smooth, thickness, strength, randomize, grab, push, twist, pinch, tint — all invertible, with selection masking</li>
                <li><b>Edit:</b> click / box select, modal move-rotate-scale with axis locking, flip, simplify, subdivide, cyclic, reverse, ordering</li>
                <li><b>Animate:</b> keys with hold exposure, onion skin, interpolate sequence with easing, multiframe editing, fps and scene length</li>
                <li><b>Layers:</b> opacity, blend modes, tint, transform, parenting, masking, per-layer onion</li>
                <li><b>Modifiers:</b> noise, offset, thickness, build, tint, simplify — all non-destructive</li>
                <li><b>Paper import:</b> illumination flattening, auto threshold, despeckle, skeleton tracing, thickness recovery, batch sequence import</li>
              </ul>
              <h4>Not included (and why)</h4>
              <p className="dim">
                Anything that belongs to Blender's 3D side — the 3D viewport and camera, node editors, the video sequencer,
                rigging, physics and Cycles/EEVEE rendering. This is the 2D animation half, built for the browser.
              </p>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button onClick={onTour} className="primary">▶ Replay the guided tour</button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
