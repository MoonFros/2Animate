import type { Doc } from './types'
import { renderDoc } from './render'

const OFF_ONION = { enabled: false, before: 0, after: 0, beforeColor: '#000', afterColor: '#000', opacity: 0 }

export function renderFrameToCanvas(doc: Doc, frame: number, scale = 1) {
  const c = document.createElement('canvas')
  c.width = Math.round(doc.width * scale)
  c.height = Math.round(doc.height * scale)
  const ctx = c.getContext('2d')!
  ctx.scale(scale, scale)
  renderDoc(ctx, doc, frame, OFF_ONION, null)
  return c
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/* ------------------------------------------------------------- tiny ZIP */
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Uint8Array) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Store-only (no deflate) zip — fine for PNGs which are already compressed. */
export function makeZip(files: { name: string; data: Uint8Array }[]) {
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const enc = new TextEncoder()
  for (const f of files) {
    const nameBytes = enc.encode(f.name)
    const crc = crc32(f.data)
    const local = new Uint8Array(30 + nameBytes.length)
    const dv = new DataView(local.buffer)
    dv.setUint32(0, 0x04034b50, true)
    dv.setUint16(4, 20, true)
    dv.setUint16(6, 0, true)
    dv.setUint16(8, 0, true)
    dv.setUint16(10, 0, true)
    dv.setUint16(12, 0, true)
    dv.setUint32(14, crc, true)
    dv.setUint32(18, f.data.length, true)
    dv.setUint32(22, f.data.length, true)
    dv.setUint16(26, nameBytes.length, true)
    dv.setUint16(28, 0, true)
    local.set(nameBytes, 30)
    chunks.push(local, f.data)

    const cen = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(cen.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, f.data.length, true)
    cv.setUint32(24, f.data.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true)
    cen.set(nameBytes, 46)
    central.push(cen)
    offset += local.length + f.data.length
  }
  const centralSize = central.reduce((a, b) => a + b.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  return new Blob([...chunks, ...central, end] as BlobPart[], { type: 'application/zip' })
}

export async function exportPNGSequence(doc: Doc, onProgress?: (n: number, total: number) => void) {
  const files: { name: string; data: Uint8Array }[] = []
  for (let f = 0; f < doc.frameCount; f++) {
    const c = renderFrameToCanvas(doc, f)
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/png'))
    files.push({ name: `frame_${String(f).padStart(4, '0')}.png`, data: new Uint8Array(await blob.arrayBuffer()) })
    onProgress?.(f + 1, doc.frameCount)
  }
  return makeZip(files)
}

/** Record the timeline to WebM in real time using MediaRecorder. */
export async function exportVideo(doc: Doc, onProgress?: (n: number, total: number) => void): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = doc.width
  c.height = doc.height
  const ctx = c.getContext('2d')!
  const stream = c.captureStream(doc.fps)
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m))!
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
  const parts: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data)
  const done = new Promise<Blob>((res) => (rec.onstop = () => res(new Blob(parts, { type: 'video/webm' }))))
  rec.start()
  const step = 1000 / doc.fps
  for (let f = 0; f < doc.frameCount; f++) {
    renderDoc(ctx, doc, f, OFF_ONION, null)
    onProgress?.(f + 1, doc.frameCount)
    await new Promise((r) => setTimeout(r, step))
  }
  await new Promise((r) => setTimeout(r, step))
  rec.stop()
  return done
}

/** Current frame as an SVG file (vector out, for Inkscape / Blender import). */
export function exportSVG(doc: Doc, frame: number) {
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${doc.width}" height="${doc.height}" viewBox="0 0 ${doc.width} ${doc.height}">`,
  ]
  if (doc.bg && doc.bg !== 'transparent') parts.push(`<rect width="100%" height="100%" fill="${doc.bg}"/>`)
  for (const l of doc.layers) {
    if (!l.visible) continue
    let key = null as null | (typeof l.keys)[number]
    for (const k of l.keys) if (k.frame <= frame && (!key || k.frame > key.frame)) key = k
    if (!key) continue
    parts.push(`<g opacity="${l.opacity}">`)
    for (const s of key.strokes) {
      const d = s.pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
      parts.push(
        `<path d="${d}" fill="${s.fill ?? 'none'}" stroke="${l.tint ?? s.color}" stroke-width="${s.width.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" opacity="${s.opacity}"/>`,
      )
    }
    parts.push('</g>')
  }
  parts.push('</svg>')
  return new Blob([parts.join('\n')], { type: 'image/svg+xml' })
}
