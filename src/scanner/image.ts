/** Utilitaires d'image pour le scanner (capture caméra, import de photo, compression). */

export const CARD_RATIO = 63 / 88

/**
 * Découpe dans le flux vidéo la zone correspondant au cadre affiché à l'écran
 * (la vidéo est affichée en `object-fit: cover`). Une petite marge absorbe les imprécisions de cadrage.
 */
export function captureGuide(video: HTMLVideoElement, container: DOMRect, guide: DOMRect, margin = 0.06): HTMLCanvasElement {
  const vw = video.videoWidth
  const vh = video.videoHeight
  const scale = Math.max(container.width / vw, container.height / vh)
  const offX = (vw * scale - container.width) / 2
  const offY = (vh * scale - container.height) / 2
  let sx = (guide.left - container.left + offX) / scale
  let sy = (guide.top - container.top + offY) / scale
  let sw = guide.width / scale
  let sh = guide.height / scale
  const mx = sw * margin
  const my = sh * margin
  sx = Math.max(0, sx - mx)
  sy = Math.max(0, sy - my)
  sw = Math.min(vw - sx, sw + 2 * mx)
  sh = Math.min(vh - sy, sh + 2 * my)

  const targetH = Math.min(1600, Math.round(sh))
  const targetW = Math.round((sw / sh) * targetH)
  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH)
  return canvas
}

/** Charge une photo choisie par l'utilisateur dans un canvas (côté le plus long ≤ 1800 px). */
export async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const max = 1800
  const s = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * s)
  canvas.height = Math.round(bitmap.height * s)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas
}

/** Redimensionne puis encode en JPEG base64 (sans le préfixe data:). */
export function toJpegBase64(source: HTMLCanvasElement, maxSide = 1100, quality = 0.85): string {
  const s = Math.min(1, maxSide / Math.max(source.width, source.height))
  let canvas = source
  if (s < 1) {
    canvas = document.createElement('canvas')
    canvas.width = Math.round(source.width * s)
    canvas.height = Math.round(source.height * s)
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  }
  return canvas.toDataURL('image/jpeg', quality).split(',')[1] ?? ''
}

/** Extrait une zone (en proportions) avec agrandissement et contraste renforcé pour l'OCR. */
export function cropForOcr(source: HTMLCanvasElement, x: number, y: number, w: number, h: number, upscale = 2): HTMLCanvasElement {
  const sx = Math.round(source.width * x)
  const sy = Math.round(source.height * y)
  const sw = Math.max(1, Math.round(source.width * w))
  const sh = Math.max(1, Math.round(source.height * h))
  const canvas = document.createElement('canvas')
  canvas.width = sw * upscale
  canvas.height = sh * upscale
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  let min = 255
  let max = 0
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    d[i] = d[i + 1] = d[i + 2] = g
    if (g < min) min = g
    if (g > max) max = g
  }
  const range = Math.max(1, max - min)
  for (let i = 0; i < d.length; i += 4) {
    const v = ((d[i] - min) / range) * 255
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}
