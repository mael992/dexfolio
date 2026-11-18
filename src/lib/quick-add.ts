import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { toast } from 'sonner'
import { snapshotFromDetail, type CardSnapshot } from './collection'
import { useAdjustCard, useCollection } from './collection-hooks'
import { cardQuery } from './queries'
import { useSettings } from './settings'
import { availableVariants, defaultVariant, type CardVariants, type Lang, type Variant } from './tcgdex'

/**
 * Ajout / retrait rapide d'une carte.
 * Si l'instantané n'est pas fourni, la fiche complète est récupérée (mise en cache) pour
 * connaître les variantes, la rareté et le n° de Pokédex.
 */
export function useQuickAdd() {
  const qc = useQueryClient()
  const adjust = useAdjustCard()
  const { index } = useCollection()
  const { cardLang } = useSettings()

  const add = useCallback(
    async (
      cardId: string,
      opts: { snapshot?: CardSnapshot; variants?: CardVariants | null; variant?: Variant; lang?: Lang; delta?: number; notify?: boolean } = {},
    ) => {
      try {
        let snapshot = opts.snapshot
        let variants = opts.variants
        if (!snapshot || variants === undefined) {
          const detail = await qc.fetchQuery(cardQuery(cardLang, cardId))
          snapshot = snapshotFromDetail(detail)
          variants = detail.variants ?? null
        }
        // La variante demandée n'est retenue que si elle existe pour cette carte.
        const variant =
          opts.variant && (variants == null || availableVariants(variants).includes(opts.variant)) ? opts.variant : defaultVariant(variants)
        adjust.mutate({ card: snapshot, lang: opts.lang ?? cardLang, variant, delta: opts.delta ?? 1 })
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(12)
        if (opts.notify) toast.success('Ajoutée à ta collection', { description: snapshot.name })
        return { snapshot, variant }
      } catch (e) {
        toast.error('Impossible d’ajouter la carte', { description: (e as Error).message })
        return null
      }
    },
    [qc, adjust, cardLang],
  )

  /** Retire l'exemplaire modifié le plus récemment (toutes variantes / langues confondues). */
  const removeOne = useCallback(
    (cardId: string) => {
      const items = index.items.filter((i) => i.card_id === cardId).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      const it = items[0]
      if (!it) return
      adjust.mutate({
        card: {
          cardId: it.card_id,
          setId: it.set_id,
          name: it.card_name,
          localId: it.card_local_id,
          image: it.card_image,
          rarity: it.rarity,
          dexIds: it.dex_ids,
        },
        lang: it.lang,
        variant: it.variant,
        delta: -1,
      })
    },
    [index.items, adjust],
  )

  return { add, removeOne }
}
