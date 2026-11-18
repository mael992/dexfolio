import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { toast } from 'sonner'
import { snapshotFromDetail, type CardSnapshot } from './collection'
import { useAdjustCard, useCollection } from './collection-hooks'
import { cardQuery } from './queries'
import { useSettings } from './settings'
import { availableVariants, pickDefault, verifiedVariants, type CardVariants, type Lang, type Variant } from './tcgdex'

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
      opts: {
        snapshot?: CardSnapshot
        variants?: CardVariants | null
        variant?: Variant
        /** Variante choisie explicitement : on la garde même si la base ne la liste pas */
        forceVariant?: boolean
        lang?: Lang
        delta?: number
        notify?: boolean
      } = {},
    ) => {
      try {
        // Fiche complète (mise en cache) : variantes vérifiées avec les ventes réelles du marché
        let snapshot = opts.snapshot
        let available: Variant[]
        try {
          const detail = await qc.fetchQuery(cardQuery(cardLang, cardId))
          snapshot = snapshot ?? snapshotFromDetail(detail)
          available = verifiedVariants(detail).list
        } catch (e) {
          if (!snapshot) throw e
          available = availableVariants(opts.variants)
        }
        // La variante demandée n'est retenue que si elle existe (ou si l'utilisateur l'a choisie lui-même).
        const variant = opts.variant && (opts.forceVariant || available.includes(opts.variant)) ? opts.variant : pickDefault(available)
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
