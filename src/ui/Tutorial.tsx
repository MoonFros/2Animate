import { useEffect, useLayoutEffect, useState } from 'react'
import { useStore } from '../core/store'

export const TOUR_SEEN_KEY = '2animate.tourSeen'

interface Step {
  title: string
  body: React.ReactNode
  /** data-tour attribute of the element to spotlight */
  target?: string
  /** run when the step opens, to put the app in the right state */
  onEnter?: () => void
}

function useSteps(): Step[] {
  const setTool = useStore((s) => s.setTool)
  return [
    {
      title: 'Welcome to 2Animate 👋',
      body: (
        <>
          <p>
            This is a 2D animation studio that runs on <b>drawings you made on paper</b>. Photograph them, and the app
            turns the lines into real editable curves — no drawing tablet needed. You can also just draw here with a
            mouse or finger.
          </p>
          <p className="dim">Takes about a minute. You can reopen it any time from the ? button.</p>
        </>
      ),
    },
    {
      title: '1. Bring in a paper drawing',
      target: 'import',
      body: (
        <>
          <p>
            Hit <b>Import paper drawing</b>, pick a photo (or press <b>Load sample</b> to try it right now).
          </p>
          <ul>
            <li><b>Crop</b> tab: drag a box around just the paper, so the desk and your hand are ignored.</li>
            <li><b>Threshold</b>: raise it if paper texture shows up, lower it if lines break apart.</li>
            <li>Select several photos at once to import a whole flipbook as a keyframe sequence.</li>
          </ul>
        </>
      ),
    },
    {
      title: '2. Draw and erase',
      target: 'tools',
      onEnter: () => setTool('draw'),
      body: (
        <>
          <p>
            <b>Draw</b> (D) has a stabiliser for shaky hands and supports stylus pressure. <b>Fill</b> (F) pours colour
            into an enclosed shape; if it leaks, raise <b>Leak size</b>. <b>Erase</b> (E) rubs out part of a line, or
            deletes whole strokes.
          </p>
        </>
      ),
    },
    {
      title: '3. Sculpt your lines',
      target: 'sculpt',
      onEnter: () => setTool('smooth'),
      body: (
        <>
          <p>These are the Blender Grease Pencil sculpt brushes, working on traced paper lines too:</p>
          <ul>
            <li><b>Smooth</b> — irons out wobble from a shaky scan</li>
            <li><b>Thickness</b> / <b>Strength</b> — fatten or fade ink</li>
            <li><b>Grab</b>, <b>Push</b>, <b>Twist</b>, <b>Pinch</b> — reshape without redrawing</li>
            <li><b>Randomize</b> — adds life; <b>Tint</b> paints colour onto points</li>
          </ul>
          <p className="dim">Hold <b>Alt</b> to invert any brush.</p>
        </>
      ),
    },
    {
      title: '4. Select and transform',
      target: 'tools',
      onEnter: () => setTool('select'),
      body: (
        <>
          <p>
            With <b>Select</b> (V), click a line or drag a box, then use Blender's transform keys: <b>G</b> move,
            <b> R</b> rotate, <b>S</b> scale. Press <b>X</b> or <b>Y</b> to lock an axis, click or Enter to confirm, Esc
            to cancel. Ctrl+A selects everything on the frame.
          </p>
        </>
      ),
    },
    {
      title: '5. Keyframes and onion skin',
      target: 'keys',
      body: (
        <>
          <p>
            Each drawing sits on a <b>key</b> and holds until the next one. Use <b>+ Key</b> for a blank drawing,
            <b> Dup</b> to copy the current one forward.
          </p>
          <p>
            <b>Onion skin</b> shows the previous drawings in red and the next in blue so you can line up your movement.
            Toggle with <b>O</b>.
          </p>
        </>
      ),
    },
    {
      title: '6. Let the computer in-between',
      target: 'interp',
      body: (
        <>
          <p>
            Put the playhead between two keys that have empty frames between them and press <b>⟿ Interpolate</b>. The app
            pairs up the strokes and generates the in-betweens, with easing and on-ones / on-twos stepping.
          </p>
          <p className="dim">Great for pans, holds and simple shape changes — keep the hand-drawn ones for the fun bits.</p>
        </>
      ),
    },
    {
      title: '7. Layers, modifiers and masks',
      target: 'layers',
      body: (
        <>
          <p>
            Separate lines, colour and background onto layers — each has opacity, blend mode, tint, a transform and
            optional <b>parenting</b> and <b>masking</b>.
          </p>
          <p>
            In the <b>Modifiers</b> tab, add <b>Noise</b> for hand-drawn boil, <b>Build</b> for draw-on animation, or
            <b> Offset</b> to slide a whole layer — none of it touches your actual strokes.
          </p>
        </>
      ),
    },
    {
      title: '8. Multiframe editing',
      target: 'multiframe',
      body: (
        <>
          <p>
            Turn on <b>Multiframe</b> and a brush or transform hits the neighbouring keys as well — perfect for nudging
            a whole action across several drawings at once. <b>Falloff</b> makes the effect weaker on distant keys.
          </p>
        </>
      ),
    },
    {
      title: '9. Get it out',
      target: 'export',
      body: (
        <>
          <p>
            Export the current frame as <b>PNG</b> or <b>SVG</b> (vector — opens in Inkscape or imports into Blender), the
            whole animation as a <b>PNG sequence zip</b> or a <b>WebM video</b>. Save your scene as JSON to keep working
            later.
          </p>
          <p className="dim">That's the tour. Go make something.</p>
        </>
      ),
    },
  ]
}

export default function Tutorial({ onClose }: { onClose: () => void }) {
  const steps = useSteps()
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const step = steps[i]

  useEffect(() => {
    step.onEnter?.()
  }, [i])

  useLayoutEffect(() => {
    const find = () => {
      if (!step.target) return setRect(null)
      const el = document.querySelector(`[data-tour="${step.target}"]`)
      setRect(el ? el.getBoundingClientRect() : null)
    }
    find()
    window.addEventListener('resize', find)
    const t = setInterval(find, 400)
    return () => {
      window.removeEventListener('resize', find)
      clearInterval(t)
    }
  }, [i, step.target])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setI((v) => Math.min(steps.length - 1, v + 1))
      if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [steps.length, onClose])

  const pad = 8
  const spot = rect
    ? { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
    : null

  // place the card near the highlight without falling off screen
  const cardW = 380
  let cardStyle: React.CSSProperties = { left: `calc(50% - ${cardW / 2}px)`, top: '18vh' }
  if (spot) {
    const below = spot.top + spot.height + 14
    const room = window.innerHeight - below
    const top = room > 260 ? below : Math.max(12, spot.top - 280)
    const left = Math.min(Math.max(12, spot.left + spot.width / 2 - cardW / 2), window.innerWidth - cardW - 12)
    cardStyle = { left, top }
  }

  return (
    <div className="tour">
      {spot ? (
        <div className="tour-spot" style={spot} />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-card" style={{ ...cardStyle, width: cardW }}>
        <h3>{step.title}</h3>
        <div className="tour-body">{step.body}</div>
        <div className="tour-foot">
          <div className="dots">
            {steps.map((_, n) => (
              <span key={n} className={n === i ? 'on' : ''} onClick={() => setI(n)} />
            ))}
          </div>
          <div className="hgroup">
            <button onClick={onClose}>Skip</button>
            <button disabled={i === 0} onClick={() => setI(i - 1)}>Back</button>
            {i < steps.length - 1 ? (
              <button className="primary" onClick={() => setI(i + 1)}>Next</button>
            ) : (
              <button className="primary" onClick={onClose}>Start drawing</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
