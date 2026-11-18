import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from './auth'
import { supabase } from './supabase'

/**
 * Photos personnelles des cartes (Supabase Storage, espace privé « card-photos »).
 * Fichier : <id utilisateur>/<id de carte>.jpg — visible uniquement par son propriétaire.
 */
const BUCKET = 'card-photos'
const URL_TTL = 60 * 60 * 24 // liens signés valables 24 h

const fileName = (cardId: string) => `${encodeURIComponent(cardId)}.jpg`

export function useCardPhotos() {
  const { user, userKey, status } = useAuth()
  return useQuery({
    queryKey: ['card-photos', userKey],
    enabled: !!supabase && !!user && status === 'signedIn',
    staleTime: 6 * 60 * 60 * 1000,
    queryFn: async (): Promise<Map<string, string>> => {
      const map = new Map<string, string>()
      if (!supabase || !user) return map
      const { data: files, error } = await supabase.storage.from(BUCKET).list(user.id, { limit: 1000 })
      if (error || !files?.length) return map
      const paths = files.filter((f) => f.name.endsWith('.jpg')).map((f) => `${user.id}/${f.name}`)
      if (!paths.length) return map
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, URL_TTL)
      for (const s of signed ?? []) {
        if (!s.signedUrl || !s.path) continue
        const cardId = decodeURIComponent(s.path.slice(user.id.length + 1).replace(/\.jpg$/, ''))
        map.set(cardId, s.signedUrl)
      }
      return map
    },
  })
}

export const CARD_RATIO = 63 / 88

/** Zone de la carte dans la photo, en pixels de l'image d'origine (redressée au format carte à l'enregistrement). */
export interface CropBox {
  x: number
  y: number
  w: number
  h: number
}

/** Charge la photo (orientation EXIF respectée), côté le plus long ≤ 2000 px. */
export async function loadPhoto(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const s = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * s)
  canvas.height = Math.round(bitmap.height * s)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas
}

/** Garde le cadre dans l'image, avec une taille minimale. */
export function clampBox(b: CropBox, imgW: number, imgH: number): CropBox {
  const w = Math.max(40, Math.min(b.w, imgW))
  const h = Math.max(40, Math.min(b.h, imgH))
  return { w, h, x: Math.max(0, Math.min(b.x, imgW - w)), y: Math.max(0, Math.min(b.y, imgH - h)) }
}

/**
 * Détecte la carte : couleur du fond estimée sur le pourtour de la photo, puis lignes / colonnes
 * où une bonne part des pixels s'en distinguent nettement. Repli : cadre centré le plus grand possible.
 */
export function detectCard(canvas: HTMLCanvasElement): CropBox {
  const fw = Math.min(canvas.width, canvas.height * CARD_RATIO) * 0.9
  const centered = { w: fw, h: fw / CARD_RATIO, x: (canvas.width - fw) / 2, y: (canvas.height - fw / CARD_RATIO) / 2 }
  const s = Math.min(1, 320 / Math.max(canvas.width, canvas.height))
  const w = Math.max(1, Math.round(canvas.width * s))
  const h = Math.max(1, Math.round(canvas.height * s))
  const small = document.createElement('canvas')
  small.width = w
  small.height = h
  const ctx = small.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(canvas, 0, 0, w, h)
  const d = ctx.getImageData(0, 0, w, h).data

  // Contours (Sobel) en luminance + teinte : les bords de la carte forment de longues lignes droites
  const lum = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const r = d[i * 4]
    const g = d[i * 4 + 1]
    const b = d[i * 4 + 2]
    // la saturation aide quand carte et fond ont une luminosité proche
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b + 0.5 * (Math.max(r, g, b) - Math.min(r, g, b))
  }
  const col = new Float32Array(w)
  const row = new Float32Array(h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = (yy: number, xx: number) => lum[yy * w + xx]
      const gx = p(y - 1, x + 1) + 2 * p(y, x + 1) + p(y + 1, x + 1) - p(y - 1, x - 1) - 2 * p(y, x - 1) - p(y + 1, x - 1)
      const gy = p(y + 1, x - 1) + 2 * p(y + 1, x) + p(y + 1, x + 1) - p(y - 1, x - 1) - 2 * p(y - 1, x) - p(y - 1, x + 1)
      col[x] += Math.abs(gx)
      row[y] += Math.abs(gy)
    }
  }
  const peaks = (a: Float32Array) => {
    const sm = a.map((_, i) => (a[i - 1] ?? a[i]) + a[i] + (a[i + 1] ?? a[i]))
    const idx: number[] = []
    for (let i = 2; i < sm.length - 2; i++) if (sm[i] >= sm[i - 1] && sm[i] >= sm[i + 1]) idx.push(i)
    idx.sort((p, q) => sm[q] - sm[p])
    const kept: number[] = []
    for (const i of idx) {
      if (kept.every((k) => Math.abs(k - i) > 3)) kept.push(i)
      if (kept.length >= 10) break
    }
    const max = Math.max(...sm, 1)
    return kept.map((i) => ({ i, v: sm[i] / max }))
  }
  const cp = peaks(col)
  const rp = peaks(row)
  let best: { l: number; r: number; t: number; b: number; score: number } | null = null
  for (const l of cp)
    for (const r of cp) {
      if (r.i - l.i < w * 0.2) continue
      for (const t of rp)
        for (const b of rp) {
          if (b.i - t.i < h * 0.2) continue
          // Photo prise en biais : la carte peut paraître plus large ou plus haute que 63:88
          const ratio = ((r.i - l.i) / s / ((b.i - t.i) / s)) * 1
          const err = Math.abs(ratio - CARD_RATIO) / CARD_RATIO
          if (err > 0.45) continue
          const area = ((r.i - l.i) * (b.i - t.i)) / (w * h)
          // Le bord extérieur de la carte l'emporte sur les cadres intérieurs (illustration, bandeaux)
          const score = l.v + r.v + t.v + b.v - 1.2 * err + 3 * area
          if (!best || score > best.score) best = { l: l.i, r: r.i, t: t.i, b: b.i, score }
        }
    }
  if (!best) return centered
  // Petite marge pour ne pas rogner la bordure de la carte
  const bw = (best.r - best.l) / s
  const bh = (best.b - best.t) / s
  const mx = bw * 0.015
  const my = bh * 0.012
  return clampBox({ x: best.l / s - mx, y: best.t / s - my, w: bw + 2 * mx, h: bh + 2 * my }, canvas.width, canvas.height)
}

/** Découpe la zone choisie, la redresse au format carte (63:88) et compresse en JPEG (900 px de haut max). */
export function cropToBlob(canvas: HTMLCanvasElement, box: CropBox): Promise<Blob> {
  const h = Math.min(900, Math.round(Math.max(box.h, box.w / CARD_RATIO)))
  const w = Math.round(h * CARD_RATIO)
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, w, h)
  return new Promise((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('Compression impossible'))), 'image/jpeg', 0.88),
  )
}

export function useCardPhotoMutations() {
  const qc = useQueryClient()
  const { user, userKey } = useAuth()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['card-photos', userKey] })

  const upload = useMutation({
    mutationFn: async ({ cardId, blob }: { cardId: string; blob: Blob }) => {
      if (!supabase || !user) throw new Error('Connexion requise')
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(`${user.id}/${fileName(cardId)}`, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Photo enregistrée', { description: 'Elle remplace l’aperçu manquant, visible par toi seul.' })
      void invalidate()
    },
    onError: (e) => toast.error('Envoi de la photo impossible', { description: (e as Error).message }),
  })

  const remove = useMutation({
    mutationFn: async (cardId: string) => {
      if (!supabase || !user) throw new Error('Connexion requise')
      const { error } = await supabase.storage.from(BUCKET).remove([`${user.id}/${fileName(cardId)}`])
      if (error) throw error
    },
    onSuccess: () => {
      toast('Photo supprimée')
      void invalidate()
    },
    onError: (e) => toast.error('Suppression impossible', { description: (e as Error).message }),
  })

  return { upload, remove }
}
