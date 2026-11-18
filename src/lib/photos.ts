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

/** Recadre au format carte (63:88, centré) et compresse en JPEG ~900 px de haut. */
export async function prepareCardPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const ratio = 63 / 88
  let sw = bitmap.width
  let sh = bitmap.height
  if (sw / sh > ratio) sw = Math.round(sh * ratio)
  else sh = Math.round(sw / ratio)
  const sx = Math.round((bitmap.width - sw) / 2)
  const sy = Math.round((bitmap.height - sh) / 2)
  const h = Math.min(900, sh)
  const w = Math.round(h * ratio)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Compression impossible'))), 'image/jpeg', 0.85),
  )
}

export function useCardPhotoMutations() {
  const qc = useQueryClient()
  const { user, userKey } = useAuth()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['card-photos', userKey] })

  const upload = useMutation({
    mutationFn: async ({ cardId, file }: { cardId: string; file: File }) => {
      if (!supabase || !user) throw new Error('Connexion requise')
      const blob = await prepareCardPhoto(file)
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
