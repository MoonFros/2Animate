import { useEffect, useRef } from "react";
import { useStore } from "../core/store";
import { renderDoc, drawStroke, keyIndexAt, layerMatrix } from "../core/render";
import {
  distToStroke,
  resample,
  simplify,
  smoothPts,
  strokeBBox,
} from "../core/geometry";
import { applyBrush } from "../core/sculpt";
import { bucketFill } from "../core/fill";
import type { Pt, Stroke } from "../core/types";
import { isSculpt, uid } from "../core/types";

type Mode = null | "draw" | "line" | "erase" | "brush" | "move" | "box" | "pan";
type TMode = "move" | "rotate" | "scale";

interface Transform {
  mode: TMode;
  pivot: { x: number; y: number };
  start: { x: number; y: number };
  snapshots: Stroke[][];
  axis: "x" | "y" | null;
}

interface WorkKey {
  frame: number;
  strokes: Stroke[];
  /** multiframe falloff weight */
  w: number;
}

export default function Stage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const live = useRef<{
    mode: Mode;
    stroke: Stroke | null;
    works: WorkKey[] | null;
    last: { x: number; y: number } | null;
    cursor: { x: number; y: number } | null;
    panStart: { x: number; y: number; vx: number; vy: number } | null;
    invert: boolean;
    space: boolean;
    box: { x0: number; y0: number; x1: number; y1: number } | null;
    xform: Transform | null;
  }>({
    mode: null,
    stroke: null,
    works: null,
    last: null,
    cursor: null,
    panStart: null,
    invert: false,
    space: false,
    box: null,
    xform: null,
  });

  /* ------------------------------------------------------------ helpers */
  const fitScale = (cw: number, ch: number, dw: number, dh: number) =>
    Math.min(cw / dw, ch / dh) * 0.92;

  const toDoc = (e: { clientX: number; clientY: number }) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const { zoom, x, y } = useStore.getState().view;
    const doc = useStore.getState().doc;
    const s = fitScale(r.width, r.height, doc.width, doc.height) * zoom;
    const px = (e.clientX - r.left - (r.width / 2 + x)) / s + doc.width / 2;
    const py = (e.clientY - r.top - (r.height / 2 + y)) / s + doc.height / 2;
    // undo the active layer's transform so drawing lands where the cursor is
    const layer = useStore.getState().activeLayer();
    if (layer?.transform || layer?.parent) {
      const p = layerMatrix(doc, layer)
        .inverse()
        .transformPoint(new DOMPoint(px, py));
      return { x: p.x, y: p.y };
    }
    return { x: px, y: py };
  };

  const currentStrokes = (): Stroke[] => {
    const st = useStore.getState();
    const layer = st.activeLayer();
    const ki = keyIndexAt(layer, st.frame);
    return ki >= 0 ? layer.keys[ki].strokes : [];
  };

  const clone = (v: Stroke[]) => JSON.parse(JSON.stringify(v)) as Stroke[];

  /** Snapshot every key this edit should touch (multiframe editing). */
  const beginEdit = () => {
    const st = useStore.getState();
    const layer = st.activeLayer();
    const frames = st.editFrames();
    const cur = frames[0];
    live.current.works = frames.map((f, i) => ({
      frame: f,
      strokes: clone(layer.keys.find((k) => k.frame === f)?.strokes ?? []),
      w:
        i === 0
          ? 1
          : st.multiframe.falloff
            ? 1 / (1 + Math.abs(f - cur) * 0.35)
            : 1,
    }));
    return live.current.works;
  };

  const commitEdit = () => {
    const works = live.current.works;
    live.current.works = null;
    if (works?.length)
      useStore
        .getState()
        .replaceStrokesAt(
          works.map(({ frame, strokes }) => ({ frame, strokes })),
        );
  };

  /** strokes of the key currently displayed, including any in-flight edit */
  const workStrokesForFrame = (targetFrame: number) =>
    live.current.works?.find((w) => w.frame === targetFrame)?.strokes;

  /* ------------------------------------------------------------- render */
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const c = canvasRef.current;
      const wrap = wrapRef.current;
      if (c && wrap) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = wrap.clientWidth;
        const h = wrap.clientHeight;
        if (
          c.width !== Math.floor(w * dpr) ||
          c.height !== Math.floor(h * dpr)
        ) {
          c.width = Math.floor(w * dpr);
          c.height = Math.floor(h * dpr);
          c.style.width = w + "px";
          c.style.height = h + "px";
        }
        const ctx = c.getContext("2d")!;
        const st = useStore.getState();
        const doc = st.doc;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const s = fitScale(w, h, doc.width, doc.height) * st.view.zoom;
        ctx.save();
        ctx.translate(w / 2 + st.view.x, h / 2 + st.view.y);
        ctx.scale(s, s);
        ctx.translate(-doc.width / 2, -doc.height / 2);

        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 24 / s;
        ctx.fillStyle = doc.bg === "transparent" ? "#ffffff" : doc.bg || "#ffffff";
        ctx.fillRect(0, 0, doc.width, doc.height);
        ctx.restore();
        if (doc.bg === "transparent") {
          // checkerboard so it reads as "no background" rather than white paper
          const cs = 16;
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, doc.width, doc.height);
          ctx.clip();
          ctx.fillStyle = "#d9d9d9";
          for (let yy = 0; yy < doc.height; yy += cs)
            for (let xx = 0; xx < doc.width; xx += cs)
              if (((xx / cs) | 0) % 2 === ((yy / cs) | 0) % 2) ctx.fillRect(xx, yy, cs, cs);
          ctx.restore();
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, doc.width, doc.height);
        ctx.clip();

        const layerNow = st.activeLayer();
        const kiNow = keyIndexAt(layerNow, st.frame);
        const targetFrame = kiNow >= 0 ? layerNow.keys[kiNow].frame : -1;
        const work = live.current.works
          ? workStrokesForFrame(targetFrame)
          : null;
        if (work) {
          const layer = layerNow;
          const docCopy = {
            ...doc,
            layers: doc.layers.map((l) =>
              l.id === layer.id
                ? {
                    ...l,
                    keys: l.keys.map((k) =>
                      k.frame === targetFrame ? { ...k, strokes: work } : k,
                    ),
                  }
                : l,
            ),
          };
          renderDoc(ctx, docCopy, st.frame, st.onion, st.activeLayerId, {
            background: false,
          });
        } else {
          renderDoc(ctx, doc, st.frame, st.onion, st.activeLayerId, {
            background: false,
          });
        }

        if (live.current.stroke) drawStroke(ctx, live.current.stroke, null, 1);

        // selection outlines
        if (st.selection.length) {
          const strokes = work ?? currentStrokes();
          ctx.save();
          ctx.strokeStyle = "#ff9f1a";
          ctx.lineWidth = 1.5 / s;
          ctx.setLineDash([6 / s, 4 / s]);
          let X0 = Infinity;
          let Y0 = Infinity;
          let X1 = -Infinity;
          let Y1 = -Infinity;
          for (const sid of st.selection) {
            const stk = strokes.find((x) => x.id === sid);
            if (!stk) continue;
            const b = strokeBBox(stk);
            X0 = Math.min(X0, b.x0);
            Y0 = Math.min(Y0, b.y0);
            X1 = Math.max(X1, b.x1);
            Y1 = Math.max(Y1, b.y1);
          }
          if (X0 < Infinity) {
            ctx.strokeRect(X0, Y0, X1 - X0, Y1 - Y0);
            ctx.setLineDash([]);
            ctx.fillStyle = "#ff9f1a";
            const hs = 5 / s;
            for (const [hx, hy] of [
              [X0, Y0],
              [X1, Y0],
              [X0, Y1],
              [X1, Y1],
            ])
              ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2);
          }
          ctx.restore();
        }

        if (live.current.box) {
          const b = live.current.box;
          ctx.save();
          ctx.strokeStyle = "#ff9f1a";
          ctx.setLineDash([5 / s, 3 / s]);
          ctx.lineWidth = 1 / s;
          ctx.strokeRect(
            Math.min(b.x0, b.x1),
            Math.min(b.y0, b.y1),
            Math.abs(b.x1 - b.x0),
            Math.abs(b.y1 - b.y0),
          );
          ctx.restore();
        }

        // transform guides
        const xf = live.current.xform;
        if (xf && live.current.cursor) {
          ctx.save();
          ctx.strokeStyle =
            xf.axis === "x"
              ? "#ff5555"
              : xf.axis === "y"
                ? "#55ff77"
                : "#ffffff";
          ctx.lineWidth = 1 / s;
          ctx.setLineDash([5 / s, 4 / s]);
          ctx.beginPath();
          if (xf.axis === "x") {
            ctx.moveTo(-1e5, xf.pivot.y);
            ctx.lineTo(1e5, xf.pivot.y);
          } else if (xf.axis === "y") {
            ctx.moveTo(xf.pivot.x, -1e5);
            ctx.lineTo(xf.pivot.x, 1e5);
          } else {
            ctx.moveTo(xf.pivot.x, xf.pivot.y);
            ctx.lineTo(live.current.cursor.x, live.current.cursor.y);
          }
          ctx.stroke();
          ctx.restore();
        }
        ctx.restore();

        // brush cursor
        const cur = live.current.cursor;
        if (cur) {
          const tool = st.tool;
          let r = 0;
          if (tool === "draw" || tool === "line") r = st.brush.width / 2;
          else if (tool === "erase") r = st.eraser.radius;
          else if (isSculpt(tool)) r = st.sculpt.radius;
          if (r > 0) {
            ctx.beginPath();
            ctx.arc(cur.x, cur.y, Math.max(2 / s, r), 0, Math.PI * 2);
            ctx.strokeStyle =
              tool === "erase" ? "rgba(255,80,80,0.9)" : "rgba(0,0,0,0.5)";
            ctx.lineWidth = 1 / s;
            ctx.stroke();
          }
        }
        ctx.restore();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ------------------------------------------------------------ playback */
  useEffect(() => {
    let raf = 0;
    let acc = 0;
    let prev = performance.now();
    const tick = (t: number) => {
      const st = useStore.getState();
      const dt = t - prev;
      prev = t;
      if (st.playing) {
        acc += dt;
        const step = 1000 / st.doc.fps;
        while (acc >= step) {
          acc -= step;
          const next = st.frame + 1;
          useStore
            .getState()
            .setFrame(
              next >= st.doc.frameCount
                ? st.loop
                  ? 0
                  : st.doc.frameCount - 1
                : next,
            );
        }
      } else acc = 0;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ------------------------------------------------------- transform ops */
  const beginTransform = (mode: TMode) => {
    const st = useStore.getState();
    if (!st.selection.length || !live.current.cursor) return;
    const strokes = currentStrokes();
    let X0 = Infinity;
    let Y0 = Infinity;
    let X1 = -Infinity;
    let Y1 = -Infinity;
    for (const id of st.selection) {
      const s = strokes.find((x) => x.id === id);
      if (!s) continue;
      const b = strokeBBox(s);
      X0 = Math.min(X0, b.x0);
      Y0 = Math.min(Y0, b.y0);
      X1 = Math.max(X1, b.x1);
      Y1 = Math.max(Y1, b.y1);
    }
    if (X0 === Infinity) return;
    const works = beginEdit();
    live.current.xform = {
      mode,
      pivot: { x: (X0 + X1) / 2, y: (Y0 + Y1) / 2 },
      start: { ...live.current.cursor },
      snapshots: works.map((w) => clone(w.strokes)),
      axis: null,
    };
  };

  const updateTransform = (p: { x: number; y: number }) => {
    const xf = live.current.xform;
    const st = useStore.getState();
    const works = live.current.works;
    if (!xf || !works) return;
    const sel = st.selection;
    for (let wi = 0; wi < works.length; wi++) {
      const target = works[wi].strokes;
      const snap = xf.snapshots[wi] ?? [];
      for (let i = 0; i < target.length; i++) {
        const dst = target[i];
        const src = snap[i];
        // the selection only exists on the current key; other keys move wholesale
        if (!src || (wi === 0 && !sel.includes(dst.id))) continue;
        for (let j = 0; j < dst.pts.length; j++) {
          const a = src.pts[j];
          let nx = a.x;
          let ny = a.y;
          if (xf.mode === "move") {
            const dx = xf.axis === "y" ? 0 : p.x - xf.start.x;
            const dy = xf.axis === "x" ? 0 : p.y - xf.start.y;
            nx += dx;
            ny += dy;
          } else if (xf.mode === "rotate") {
            const a0 = Math.atan2(
              xf.start.y - xf.pivot.y,
              xf.start.x - xf.pivot.x,
            );
            const a1 = Math.atan2(p.y - xf.pivot.y, p.x - xf.pivot.x);
            const ang = a1 - a0;
            const ox = a.x - xf.pivot.x;
            const oy = a.y - xf.pivot.y;
            nx = xf.pivot.x + ox * Math.cos(ang) - oy * Math.sin(ang);
            ny = xf.pivot.y + ox * Math.sin(ang) + oy * Math.cos(ang);
          } else {
            const d0 =
              Math.hypot(xf.start.x - xf.pivot.x, xf.start.y - xf.pivot.y) || 1;
            const d1 = Math.hypot(p.x - xf.pivot.x, p.y - xf.pivot.y);
            const k = Math.max(0.02, d1 / d0);
            const kx = xf.axis === "y" ? 1 : k;
            const ky = xf.axis === "x" ? 1 : k;
            nx = xf.pivot.x + (a.x - xf.pivot.x) * kx;
            ny = xf.pivot.y + (a.y - xf.pivot.y) * ky;
            dst.width = src.width * ((kx + ky) / 2);
          }
          dst.pts[j].x = nx;
          dst.pts[j].y = ny;
        }
      }
    }
  };

  const endTransform = (confirm: boolean) => {
    const st = useStore.getState();
    const xf = live.current.xform;
    if (!xf) return;
    live.current.xform = null;
    if (confirm) commitEdit();
    else live.current.works = null;
    void st;
  };

  /* -------------------------------------------------------- keyboard */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const k = e.key.toLowerCase();

      // modal transform first
      if (live.current.xform) {
        if (k === "escape") return endTransform(false);
        if (k === "enter") return endTransform(true);
        if (k === "x")
          live.current.xform.axis =
            live.current.xform.axis === "x" ? null : "x";
        if (k === "y")
          live.current.xform.axis =
            live.current.xform.axis === "y" ? null : "y";
        e.preventDefault();
        return;
      }

      if (e.code === "Space") {
        live.current.space = true;
        e.preventDefault();
      }
      if (e.altKey || e.ctrlKey) live.current.invert = true;

      if ((e.ctrlKey || e.metaKey) && k === "z") {
        e.preventDefault();
        e.shiftKey ? st.redo() : st.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && k === "y") {
        e.preventDefault();
        st.redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && k === "a") {
        e.preventDefault();
        st.setSelection(currentStrokes().map((s) => s.id));
        st.setTool("select");
        return;
      }
      if (e.ctrlKey || e.metaKey) return;

      // Blender-style modal transforms while something is selected
      if (st.selection.length && (k === "g" || k === "r" || k === "s")) {
        st.setTool("select");
        beginTransform(k === "g" ? "move" : k === "r" ? "rotate" : "scale");
        e.preventDefault();
        return;
      }

      const map: Record<string, any> = {
        d: "draw",
        b: "draw",
        l: "line",
        f: "fill",
        e: "erase",
        v: "select",
        s: "smooth",
        t: "thickness",
        u: "strength",
        n: "randomize",
        g: "grab",
        p: "push",
        w: "twist",
        i: "pinch",
      };
      if (map[k]) st.setTool(map[k]);
      if (k === "o") st.setOnion({ enabled: !st.onion.enabled });
      if (e.code === "ArrowRight") st.setFrame(st.frame + 1);
      if (e.code === "ArrowLeft") st.setFrame(st.frame - 1);
      if (e.code === "Enter") st.setPlaying(!st.playing);
      if ((k === "delete" || k === "backspace") && st.selection.length) {
        st.replaceStrokes(
          currentStrokes().filter((s) => !st.selection.includes(s.id)),
        );
        st.setSelection([]);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") live.current.space = false;
      if (!e.altKey && !e.ctrlKey) live.current.invert = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  /* ------------------------------------------------------------ erasing */
  const applyErase = (p: { x: number; y: number }) => {
    const st = useStore.getState();
    const r = st.eraser.radius;
    for (const wk of live.current.works ?? [])
      eraseIn(wk, p, r, st.eraser.whole);
  };

  const eraseIn = (
    wk: WorkKey,
    p: { x: number; y: number },
    r: number,
    whole: boolean,
  ) => {
    const work = wk.strokes;
    if (whole) {
      wk.strokes = work.filter((s) => distToStroke(s, p.x, p.y) > r);
      return;
    }
    const out: Stroke[] = [];
    for (const s of work) {
      if (distToStroke(s, p.x, p.y) > r + s.width) {
        out.push(s);
        continue;
      }
      if (s.fill) {
        // soft-erasing a filled shape just fades it, like GP's fill erase
        out.push(s);
        continue;
      }
      let run: Pt[] = [];
      let first = true;
      for (const q of s.pts) {
        if (Math.hypot(q.x - p.x, q.y - p.y) <= r) {
          if (run.length > 1)
            out.push({ ...s, id: first ? s.id : uid(), pts: run });
          first = false;
          run = [];
        } else run.push(q);
      }
      if (run.length > 1)
        out.push({ ...s, id: first ? s.id : uid(), pts: run });
    }
    wk.strokes = out;
  };

  const brushAll = (p: { x: number; y: number }, dx: number, dy: number) => {
    const st = useStore.getState();
    for (let i = 0; i < (live.current.works?.length ?? 0); i++) {
      const wk = live.current.works![i];
      applyBrush(wk.strokes, {
        tool: st.tool,
        x: p.x,
        y: p.y,
        dx,
        dy,
        radius: st.sculpt.radius,
        strength: st.sculpt.strength * wk.w,
        invert: live.current.invert,
        mask:
          i === 0 && st.sculpt.maskSelected && st.selection.length
            ? st.selection
            : null,
        color: st.brush.color,
      });
    }
  };

  /* ------------------------------------------------------------ pointer */
  const onPointerDown = (e: React.PointerEvent) => {
    const st = useStore.getState();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = toDoc(e);
    live.current.invert = e.altKey || e.ctrlKey;
    live.current.last = p;
    live.current.cursor = p;

    if (live.current.xform) {
      endTransform(e.button !== 2);
      return;
    }

    const wantPan =
      st.tool === "pan" ||
      live.current.space ||
      e.button === 1 ||
      e.buttons === 4;
    if (wantPan) {
      live.current.mode = "pan";
      live.current.panStart = {
        x: e.clientX,
        y: e.clientY,
        vx: st.view.x,
        vy: st.view.y,
      };
      return;
    }
    if (st.activeLayer().locked) return;

    const tool = st.tool;
    if (tool === "draw" || tool === "line") {
      live.current.mode = tool;
      const pres =
        e.pressure && e.pressure > 0 && e.pointerType !== "mouse"
          ? e.pressure
          : 0.75;
      live.current.stroke = {
        id: uid(),
        pts: [{ ...p, p: pres, s: 1 }],
        color: st.brush.color,
        width: st.brush.width,
        opacity: st.brush.opacity,
        fill: null,
      };
      return;
    }
    if (tool === "fill") {
      const visible: Stroke[] = [];
      for (const l of st.doc.layers) {
        if (!l.visible) continue;
        const ki = keyIndexAt(l, st.frame);
        if (ki >= 0) visible.push(...l.keys[ki].strokes);
      }
      const shape = bucketFill(
        visible,
        st.doc.width,
        st.doc.height,
        p.x,
        p.y,
        st.fill,
      );
      if (shape) {
        // fills go underneath the line art
        st.replaceStrokes([shape, ...currentStrokes()]);
      }
      return;
    }
    if (tool === "erase") {
      live.current.mode = "erase";
      beginEdit();
      applyErase(p);
      return;
    }
    if (isSculpt(tool)) {
      live.current.mode = "brush";
      beginEdit();
      brushAll(p, 0, 0);
      return;
    }
    if (tool === "select") {
      const strokes = currentStrokes();
      let hit: Stroke | null = null;
      let bestD = Infinity;
      for (const s of strokes) {
        const d = distToStroke(s, p.x, p.y);
        if (d < Math.max(8, s.width) && d < bestD) {
          bestD = d;
          hit = s;
        }
      }
      if (hit) {
        const sel = e.shiftKey
          ? [...new Set([...st.selection, hit.id])]
          : st.selection.includes(hit.id)
            ? st.selection
            : [hit.id];
        st.setSelection(sel);
        live.current.mode = "move";
        beginEdit();
      } else {
        if (!e.shiftKey) st.setSelection([]);
        live.current.mode = "box";
        live.current.box = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const st = useStore.getState();
    const p = toDoc(e);
    const last = live.current.last ?? p;
    live.current.cursor = p;
    live.current.invert = e.altKey || e.ctrlKey;

    if (live.current.xform) {
      updateTransform(p);
      live.current.last = p;
      return;
    }

    const mode = live.current.mode;
    if (!mode) {
      live.current.last = p;
      return;
    }

    switch (mode) {
      case "pan": {
        const ps = live.current.panStart!;
        st.setView({
          x: ps.vx + (e.clientX - ps.x),
          y: ps.vy + (e.clientY - ps.y),
        });
        break;
      }
      case "draw": {
        const s = live.current.stroke!;
        const pres =
          e.pressure && e.pressure > 0 && e.pointerType !== "mouse"
            ? e.pressure
            : 0.75;
        const lp = s.pts[s.pts.length - 1];
        const stab = st.brush.stabilize * 0.8;
        const np: Pt = {
          x: lp.x + (p.x - lp.x) * (1 - stab),
          y: lp.y + (p.y - lp.y) * (1 - stab),
          p: pres,
          s: 1,
        };
        if (Math.hypot(np.x - lp.x, np.y - lp.y) > 0.6) s.pts.push(np);
        break;
      }
      case "line": {
        const s = live.current.stroke!;
        s.pts = [s.pts[0], { ...p, p: s.pts[0].p, s: 1 }];
        break;
      }
      case "erase":
        applyErase(p);
        break;
      case "brush":
        brushAll(p, p.x - last.x, p.y - last.y);
        break;
      case "move": {
        const dx = p.x - last.x;
        const dy = p.y - last.y;
        (live.current.works ?? []).forEach((wk, wi) => {
          for (const s of wk.strokes) {
            if (wi === 0 && !st.selection.includes(s.id)) continue;
            for (const q of s.pts) {
              q.x += dx;
              q.y += dy;
            }
          }
        });
        break;
      }
      case "box":
        live.current.box = { ...live.current.box!, x1: p.x, y1: p.y };
        break;
    }
    live.current.last = p;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const st = useStore.getState();
    const mode = live.current.mode;
    live.current.mode = null;
    if (!mode) return;

    if (mode === "draw" || mode === "line") {
      const s = live.current.stroke!;
      live.current.stroke = null;
      if (s.pts.length < 2)
        s.pts.push({ ...s.pts[0], x: s.pts[0].x + 0.6, y: s.pts[0].y + 0.6 });
      if (mode === "draw") {
        s.pts = simplify(resample(s.pts, Math.max(1.5, s.width * 0.4)), 0.45);
        s.pts = smoothPts(s.pts, st.brush.stabilize * 0.6, 1);
        if (st.brush.taper && s.pts.length > 4) {
          s.pts[0].p *= 0.5;
          s.pts[1].p *= 0.75;
          s.pts[s.pts.length - 1].p *= 0.5;
          s.pts[s.pts.length - 2].p *= 0.75;
        }
      }
      st.addStroke(s);
      return;
    }
    if (mode === "box") {
      const b = live.current.box!;
      live.current.box = null;
      const x0 = Math.min(b.x0, b.x1);
      const x1 = Math.max(b.x0, b.x1);
      const y0 = Math.min(b.y0, b.y1);
      const y1 = Math.max(b.y0, b.y1);
      const ids = currentStrokes()
        .filter((s) =>
          s.pts.some((q) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1),
        )
        .map((s) => s.id);
      st.setSelection(
        e.shiftKey ? [...new Set([...st.selection, ...ids])] : ids,
      );
      return;
    }
    if (live.current.works) commitEdit();
  };

  const onWheel = (e: React.WheelEvent) => {
    const st = useStore.getState();
    if (e.ctrlKey || !e.shiftKey) {
      const f = Math.exp(-e.deltaY * 0.0015);
      st.setView({ zoom: Math.max(0.15, Math.min(12, st.view.zoom * f)) });
    }
  };

  return (
    <div className="stage" ref={wrapRef} onWheel={onWheel}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => (live.current.cursor = null)}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
