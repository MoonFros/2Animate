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

**Drawing & editing (Grease Pencil parity, 2D)**
- Draw tool with input stabiliser, pressure (stylus) and end taper
- Straight line tool
- **Fill / bucket** — rasterise, close leaks, flood fill, trace the region back out as a vector shape
- Eraser — soft point erase (splits strokes) or whole-stroke delete
- **Full sculpt brush set**: Smooth, Thickness, Strength, Randomize, Grab, Push/smear, Twist,
  Pinch/inflate, **Tint** (vertex paint) — Alt inverts any of them, optional "affect selection
  only" masking. Per-point thickness, strength and colour are all part of the stroke model
- Edit mode: click / box select, Ctrl+A, and **Blender modal transforms** — `G` move, `R` rotate,
  `S` scale, with `X`/`Y` axis locking, click or Enter to confirm, Esc to cancel
- Stroke operators: smooth, simplify, subdivide, cyclic, reverse, flip H/V, to front / to back
- Undo / redo, pan, zoom

**Animation**
- Layers: visibility, lock, opacity, tint, per-layer onion skin, reorder, duplicate
- Dope-sheet timeline with keyframes, hold-until-next exposure, add / duplicate / delete key
- Onion skin with before/after counts and red/blue tinting
- **Multiframe editing** — sculpt brushes and transforms apply to neighbouring keys too, with
  distance falloff
- **Interpolate Sequence** — automatic in-betweens between two keys, with linear / ease in /
  ease out / ease in-out and "on ones / on twos" stepping. Strokes are paired by position,
  length and colour, resampled to a common point count, and direction-matched so lines don't flip
- Layer blend modes: normal, multiply, screen, overlay, lighten, darken, difference
- Layer **transform, parenting and alpha masking** (use any layer as a mask, invertible)
- **Non-destructive modifier stack** per layer: Noise (hand-drawn boil), Offset, Thickness, Build
  (draw-on animation), Tint, Simplify
- Per-point strength (opacity) is part of the stroke model, so the Strength brush actually fades ink
- Playback with fps and scene length control

**Output**
- Save / open scene as JSON
- Current frame → PNG or **SVG** (vector, so it imports into Inkscape or Blender)
- All frames → PNG sequence (.zip)
- Animation → WebM video

**Learning the app**
- Guided tour on first launch — spotlights each part of the UI, replayable any time
- **? Help** panel: quick start walkthrough, photo tips for clean traces, full shortcut table,
  and an honest list of what is and isn't included

## Shortcuts

| key | action |
| --- | --- |
| D / B | draw |
| L | straight line |
| E | erase |
| F | fill |
| V | select / edit mode |
| S T U N G P W I C | smooth, thickness, strength, randomize, grab, push, twist, pinch, tint |
| Alt (hold) | invert the active sculpt brush |
| G / R / S | move / rotate / scale the selection (then X or Y to lock an axis) |
| Ctrl+A | select all on the frame |
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

- [x] Fill / bucket tool and closed-shape colouring
- [x] Frame interpolation between keys (Blender's Interpolate Sequence)
- [x] Full sculpt brush set: smooth, thickness, strength, randomize, grab, push, twist, pinch
- [x] Transform on selection: modal move / rotate / scale with axis locking, flip H/V
- [x] Multiframe editing (sculpt several keys at once)
- [x] Modifiers: noise, offset, thickness, build, tint, simplify
- [x] Vertex paint / tint brush and saved colour palettes
- [x] Layer masks and parenting
- [x] In-app guided tour and help
- [ ] Tracing in a Web Worker so huge scans never block the UI
- [ ] Materials (stroke + fill presets) and per-material styling
- [ ] Web Worker + WASM for tracing so big scans don't block the UI
- [ ] GIF export, audio track for lip sync, camera moves
- [ ] Autosave to IndexedDB and project browser
