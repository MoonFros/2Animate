# 2Animate

Turn photos of drawings on paper into **editable vector strokes**, then animate them with
Grease-Pencil-style tools — in the browser, no drawing tablet required.

> Short answer to "is this possible?": yes. Photo → clean line art → real editable curves is
> classic image processing (illumination flattening, thresholding, skeletonisation, curve
> tracing), and all of it runs fine in plain JavaScript on a phone or laptop.

## What works today

**Paper → digital**
- Import photos or scans (one, or a whole batch at once)
- Crop box so the desk, your hand and shadows get ignored
- Illumination flattening kills paper tone / uneven phone lighting
- Otsu auto-threshold + despeckle → clean ink mask
- Zhang–Suen skeletonisation + graph tracing → real polyline strokes
- Per-point thickness lifted from a distance transform, so fat marker lines stay fat
- Live preview: vector result / ink mask / crop, with threshold, detail, smoothing,
  despeckle, line weight and ink colour controls
- **Import many photos as a sequence** — shoot a flipbook, get keyframes N frames apart

**Drawing & editing (Grease Pencil-ish)**
- Draw tool with input stabiliser, pressure (stylus) and end taper
- Straight line tool
- Eraser — soft point erase (splits strokes) or whole-stroke delete
- Sculpt brushes: **Smooth**, **Thickness** (Alt = thin), **Grab/push**
- Select & move (click or box select), delete
- Undo / redo, pan, zoom

**Animation**
- Layers: visibility, lock, opacity, tint, per-layer onion skin, reorder, duplicate
- Dope-sheet timeline with keyframes, hold-until-next exposure, add / duplicate / delete key
- Onion skin with before/after counts and red/blue tinting
- Playback with fps and scene length control

**Output**
- Save / open scene as JSON
- Current frame → PNG or **SVG** (vector, so it imports into Inkscape or Blender)
- All frames → PNG sequence (.zip)
- Animation → WebM video

## Shortcuts

| key | action |
| --- | --- |
| D / B | draw |
| L | straight line |
| E | erase |
| S | smooth |
| T | thickness (Alt = thin) |
| G | grab |
| V | select |
| Space (hold) | pan |
| O | toggle onion skin |
| ← / → | step frame |
| Enter | play / pause |
| Ctrl+Z / Ctrl+Shift+Z | undo / redo |

## Run it

```bash
npm install
npm run dev
```

## Honest scope note

Blender is a 20-year-old desktop 3D suite. A browser app can match its **2D animation core**
(strokes, layers, keys, onion skin, sculpt brushes, interpolation) but not things that depend on
the 3D engine or a full DCC: 3D viewport & camera, the modifier / node stacks, VSE, rigging,
physics, Cycles/EEVEE rendering. The list below is the realistic path.

## Roadmap

- [ ] Fill / bucket tool and closed-shape colouring
- [ ] Frame interpolation between keys (Blender's Interpolate Sequence)
- [ ] More sculpt brushes: pinch, twist, randomise, strength/tint
- [ ] Transform on selection: rotate, scale, mirror, multiframe edit
- [ ] Modifiers: noise, offset, thickness, build (draw-on animation)
- [ ] Vertex/stroke colour palettes and materials
- [ ] Web Worker + WASM for tracing so big scans don't block the UI
- [ ] GIF export, audio track for lip sync, camera moves
- [ ] Autosave to IndexedDB and project browser
