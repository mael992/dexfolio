import { Camera, ChevronLeft, ChevronRight, CircleExclamationPoint, ExternalLink, Heart, Layers, Paintbrush, ShieldCheck, Trash, TrendingUp } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../lib/auth'
import { useCardSheet } from '../lib/card-sheet'
import { useCardPhotoMutations, useCardPhotos } from '../lib/photos'
import { snapshotFromDetail } from '../lib/collection'
import { useAdjustCard, useCollection, useToggleWish, useWishlist } from '../lib/collection-hooks'
import { rememberPrice } from '../lib/prices'
import { useCard, useCatalog } from '../lib/queries'
import { useSettings } from '../lib/settings'
import { foilLevel, rarityLabel } from '../lib/taxonomy'
import {
  LANGS,
  verifiedVariants,
  setSymbolUrl,
  VARIANTS,
  type CardDetail,
  type Lang,
  type TcgplayerPrice,
  type Variant,
} from '../lib/tcgdex'
import { cn, fmtDate, fmtEur, fmtUsd } from '../lib/utils'
import { CardImage, EnergyDot, HoloCard, QtyStepper, TypeBadge } from './cards'
import { Badge, Button, Sheet, Skeleton } from './ui'

export default function CardSheet() {
  const { cardId, closeCard } = useCardSheet()
  // On garde la dernière carte affichée pendant l'animation de fermeture.
  const [shown, setShown] = useState(cardId)
  useEffect(() => {
    if (cardId) setShown(cardId)
  }, [cardId])
  return (
    <Sheet open={!!cardId} onClose={closeCard} size="xl" title="Détails de la carte">
      {shown && <CardSheetContent key={shown} cardId={shown} />}
    </Sheet>
  )
}

function CardSheetContent({ cardId }: { cardId: string }) {
  const { list, goTo } = useCardSheet()
  const { data: card, isLoading, error } = useCard(cardId)

  const pos = list.indexOf(cardId)
  const prev = pos > 0 ? list[pos - 1] : null
  const next = pos >= 0 && pos < list.length - 1 ? list[pos + 1] : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowLeft' && prev) goTo(prev)
      if (e.key === 'ArrowRight' && next) goTo(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next, goTo])

  useEffect(() => {
    if (card) rememberPrice(card)
  }, [card])

  if (isLoading) {
    return (
      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,400px)_1fr]">
        <Skeleton className="mx-auto aspect-[63/88] w-[70%] rounded-[4.6%/3.3%] sm:w-full" />
        <div className="space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </div>
    )
  }

  if (error || !card) {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-center">
        <CircleExclamationPoint className="size-10 text-brand" />
        <p className="font-semibold">Impossible de charger cette carte.</p>
        <p className="text-sm text-muted">Vérifie ta connexion puis réessaie.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-6 p-5 pt-8 sm:gap-8 sm:p-8 lg:grid-cols-[minmax(0,400px)_1fr]">
      <div className="lg:sticky lg:top-0 lg:self-start">
        <div className="mx-auto w-[68%] max-w-[380px] sm:w-[55%] lg:w-full">
          <HoloCard foil={foilLevel(card.rarity)}>
            <CardImage
              image={card.image}
              cardId={card.id}
              localId={card.localId}
              name={card.name}
              quality="high"
              priority
              className="shadow-[var(--shadow-pop)]"
            />
          </HoloCard>
        </div>
        <PhotoControls cardId={card.id} hasOfficialImage={!!card.image} />
        {list.length > 1 && pos >= 0 && (
          <div className="mt-5 flex items-center justify-center gap-3">
            <Button variant="secondary" size="icon" icon={ChevronLeft} disabled={!prev} onClick={() => prev && goTo(prev)} aria-label="Carte précédente" />
            <span className="min-w-16 text-center text-sm tabular-nums text-muted">
              {pos + 1} / {list.length}
            </span>
            <Button variant="secondary" size="icon" icon={ChevronRight} disabled={!next} onClick={() => next && goTo(next)} aria-label="Carte suivante" />
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-5">
        <CardHeader card={card} />
        <OwnershipPanel card={card} />
        <PricePanel card={card} />
        <DetailsPanel card={card} />
      </div>
    </div>
  )
}

/** « Ajouter ma photo » : pour les cartes sans aperçu officiel en français (ou pour remplacer sa photo). */
function PhotoControls({ cardId, hasOfficialImage }: { cardId: string; hasOfficialImage: boolean }) {
  const { mode } = useAuth()
  const { data: photos } = useCardPhotos()
  const { upload, remove } = useCardPhotoMutations()
  const inputRef = useRef<HTMLInputElement>(null)
  const hasPhoto = !!photos?.get(cardId)
  if (mode !== 'supabase' || (hasOfficialImage && !hasPhoto)) return null
  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          variant={hasPhoto ? 'secondary' : 'soft'}
          size="sm"
          icon={Camera}
          loading={upload.isPending}
          onClick={() => inputRef.current?.click()}
        >
          {hasPhoto ? 'Changer ma photo' : 'Ajouter ma photo'}
        </Button>
        {hasPhoto && (
          <Button variant="ghost" size="sm" icon={Trash} loading={remove.isPending} onClick={() => remove.mutate(cardId)}>
            Supprimer
          </Button>
        )}
      </div>
      <p className="max-w-[300px] text-center text-[11px] text-subtle">
        {hasPhoto ? 'Ta photo, visible par toi seul.' : 'Pas d’aperçu officiel : photographie ta carte en remplissant le cadre. Visible par toi seul.'}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) upload.mutate({ cardId, file })
          e.target.value = ''
        }}
      />
    </div>
  )
}

function CardHeader({ card }: { card: CardDetail & { _lang?: Lang } }) {
  const { catalog } = useCatalog()
  const official = card.set.cardCount?.official
  return (
    <div className="pr-10">
      <Link
        to={`/extensions/${card.set.id}`}
        className="inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-muted transition hover:text-brand"
      >
        {card.set.symbol ? (
          <img src={setSymbolUrl(card.set.symbol)} alt="" className="size-5 object-contain" crossOrigin="anonymous" />
        ) : (
          <Layers className="size-4" />
        )}
        {catalog?.byId.get(card.set.id)?.name ?? card.set.name}
        <span className="font-mono text-xs text-subtle">
          {card.localId}
          {official ? `/${String(official).padStart(card.localId.length, '0')}` : ''}
        </span>
      </Link>
      <h2 className="mt-1 text-3xl font-semibold leading-tight sm:text-4xl">{card.name}</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {card.rarity && <Badge tone="accent">{rarityLabel(card.rarity)}</Badge>}
        {card.stage && <Badge>{card.stage}</Badge>}
        {card.category && card.category !== 'Pokemon' && card.category !== 'Pokémon' && <Badge>{card.category}</Badge>}
        {card.trainerType && <Badge>{card.trainerType}</Badge>}
        {card.hp && <Badge tone="brand">{card.hp} PV</Badge>}
        {card.types?.map((t) => <TypeBadge key={t} type={t} />)}
        {card._lang && card._lang !== 'fr' && <Badge tone="info">Données en {LANGS.find((l) => l.code === card._lang)?.label}</Badge>}
      </div>
    </div>
  )
}

function OwnershipPanel({ card }: { card: CardDetail & { _lang?: Lang } }) {
  const { cardLang } = useSettings()
  const { index } = useCollection()
  const { ids: wishIds } = useWishlist()
  const adjust = useAdjustCard()
  const toggleWish = useToggleWish()
  const [lang, setLang] = useState<Lang>(cardLang)
  const [showAll, setShowAll] = useState(false)

  const snapshot = useMemo(() => snapshotFromDetail(card), [card])
  const items = index.items.filter((i) => i.card_id === card.id)
  const total = items.reduce((s, i) => s + i.quantity, 0)
  const wished = wishIds.has(card.id)

  // Variantes vérifiées (ventes TCGplayer, sinon Cardmarket, sinon TCGdex) + celles déjà possédées
  const verified = useMemo(() => verifiedVariants(card), [card])
  const listed = verified.list
  const variants = useMemo(() => {
    const base = [...listed]
    for (const i of items) if (!base.includes(i.variant)) base.push(i.variant)
    return VARIANTS.filter((v) => showAll || base.includes(v.key))
  }, [listed, items, showAll])
  const hiddenCount = VARIANTS.length - variants.length

  const qty = (variant: Variant) => items.filter((i) => i.variant === variant && i.lang === lang).reduce((s, i) => s + i.quantity, 0)
  const byLang = LANGS.map((l) => ({ ...l, n: items.filter((i) => i.lang === l.code).reduce((s, i) => s + i.quantity, 0) })).filter((l) => l.n > 0)

  return (
    <section className="surface rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Dans ma collection</h3>
          <p className="text-sm text-muted">
            {total > 0 ? (
              <>
                <strong className="text-fg">{total}</strong> exemplaire{total > 1 ? 's' : ''}
                {byLang.length > 0 && ` · ${byLang.map((l) => `${l.short} ${l.n}`).join(' · ')}`}
              </>
            ) : (
              'Pas encore possédée'
            )}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-muted">
          Langue de l’exemplaire
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
            className="h-9 rounded-lg border border-line bg-sunken px-2 text-sm font-semibold text-fg outline-none focus:border-info"
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.short} — {l.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 divide-y divide-line">
        {variants.map((v) => (
          <div key={v.key} className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  'grid size-8 place-items-center rounded-lg text-xs font-bold',
                  v.key === 'normal' && 'bg-sunken text-muted',
                  v.key === 'reverse' && 'bg-info-soft text-info',
                  v.key === 'holo' && 'holo-fill text-white',
                  (v.key === 'firstEdition' || v.key === 'wPromo') && 'bg-accent-soft text-accent-strong',
                )}
              >
                {v.short}
              </span>
              <span className="font-semibold">{v.label}</span>
              {!listed.includes(v.key) && <span className="text-[11px] text-subtle">non vérifiée</span>}
            </div>
            <QtyStepper
              value={qty(v.key)}
              label={v.label}
              onChange={(delta) => adjust.mutate({ card: snapshot, lang, variant: v.key, delta })}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]">
        <span className="inline-flex items-center gap-1 text-subtle">
          <ShieldCheck className={cn('size-3.5', verified.source === 'tcgdex' ? 'text-subtle' : 'text-success')} />
          {verified.source === 'tcgplayer'
            ? 'Variantes vérifiées avec les ventes réelles (TCGplayer)'
            : verified.source === 'cardmarket'
              ? 'Variantes vérifiées avec les prix Cardmarket'
              : 'Variantes selon la base TCGdex (non vérifiables sur le marché)'}
        </span>
        {hiddenCount > 0 && (
          <button type="button" onClick={() => setShowAll(true)} className="font-semibold text-info hover:underline">
            + Autre variante
          </button>
        )}
      </div>

      <Button
        variant={wished ? 'soft' : 'secondary'}
        className="mt-3 w-full"
        icon={Heart}
        onClick={() => toggleWish.mutate({ card: snapshot, wished })}
      >
        {wished ? 'Dans ma liste d’envies' : 'Ajouter à ma liste d’envies'}
      </Button>
    </section>
  )
}

function PricePanel({ card }: { card: CardDetail }) {
  const cm = card.pricing?.cardmarket
  const tp = card.pricing?.tcgplayer
  const tpRows = tp
    ? (Object.entries(tp).filter(([k, v]) => k !== 'unit' && k !== 'updated' && v && typeof v === 'object') as [string, TcgplayerPrice][])
    : []
  const tpLabel: Record<string, string> = {
    normal: 'Normale',
    holofoil: 'Holo',
    'reverse-holofoil': 'Reverse',
    '1st-edition': '1ʳᵉ éd.',
    '1st-edition-holofoil': '1ʳᵉ éd. holo',
    unlimited: 'Illimitée',
    'unlimited-holofoil': 'Illimitée holo',
  }
  const cardmarketSearch = `https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${encodeURIComponent(card.name)}`

  if (!cm && !tpRows.length) {
    return (
      <section className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
        Aucun prix de marché disponible pour cette carte.
      </section>
    )
  }

  return (
    <section className="surface rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <TrendingUp className="size-5 text-success" /> Cote du marché
        </h3>
        <a href={cardmarketSearch} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-info hover:underline">
          Cardmarket <ExternalLink className="size-3.5" />
        </a>
      </div>
      {cm && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <PriceStat label="Tendance" value={fmtEur(cm.trend || null)} strong />
          <PriceStat label="Moy. 30 j" value={fmtEur(cm.avg30 || null)} />
          <PriceStat label="À partir de" value={fmtEur(cm.low || null)} />
          <PriceStat label="Tendance reverse/holo" value={fmtEur(cm['trend-holo'] || null)} />
        </div>
      )}
      {tpRows.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span className="font-semibold text-fg">TCGplayer (US)</span>
          {tpRows.map(([k, v]) => (
            <span key={k}>
              {tpLabel[k] ?? k} : <strong className="text-fg">{fmtUsd(v.marketPrice ?? v.midPrice)}</strong>
            </span>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] text-subtle">
        Prix indicatifs (source TCGdex){cm?.updated ? `, mis à jour le ${fmtDate(cm.updated)}` : ''}.
      </p>
    </section>
  )
}

function PriceStat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('rounded-xl px-3 py-2.5', strong ? 'bg-success-soft' : 'bg-sunken')}>
      <div className="text-[11px] font-semibold text-muted">{label}</div>
      <div className={cn('font-display text-lg font-semibold tabular-nums', strong && 'text-success')}>{value}</div>
    </div>
  )
}

function DetailsPanel({ card }: { card: CardDetail }) {
  const hasCombat = !!(card.attacks?.length || card.abilities?.length)
  return (
    <section className="space-y-4">
      {card.abilities?.map((a) => (
        <div key={a.name} className="rounded-2xl border border-line p-4">
          <div className="flex items-center gap-2">
            <Badge tone="brand">{a.type ?? 'Talent'}</Badge>
            <span className="font-semibold">{a.name}</span>
          </div>
          {a.effect && <p className="mt-2 text-sm leading-relaxed text-muted">{a.effect}</p>}
        </div>
      ))}
      {card.attacks?.map((a) => (
        <div key={a.name} className="rounded-2xl border border-line p-4">
          <div className="flex items-center gap-2">
            <span className="flex gap-0.5">
              {(a.cost ?? []).map((c, i) => (
                <EnergyDot key={i} type={c} size="sm" />
              ))}
            </span>
            <span className="flex-1 font-semibold">{a.name}</span>
            {a.damage != null && a.damage !== '' && <span className="font-display text-xl font-semibold">{a.damage}</span>}
          </div>
          {a.effect && <p className="mt-2 text-sm leading-relaxed text-muted">{a.effect}</p>}
        </div>
      ))}
      {!hasCombat && (card.effect || card.description) && (
        <p className="rounded-2xl border border-line p-4 text-sm leading-relaxed text-muted">{card.effect ?? card.description}</p>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-sunken p-4 text-sm sm:grid-cols-3">
        {card.weaknesses?.length ? (
          <Info label="Faiblesse">
            {card.weaknesses.map((w) => (
              <span key={w.type} className="inline-flex items-center gap-1">
                <EnergyDot type={w.type} size="sm" /> {w.value}
              </span>
            ))}
          </Info>
        ) : null}
        {card.resistances?.length ? (
          <Info label="Résistance">
            {card.resistances.map((w) => (
              <span key={w.type} className="inline-flex items-center gap-1">
                <EnergyDot type={w.type} size="sm" /> {w.value}
              </span>
            ))}
          </Info>
        ) : null}
        {card.retreat != null && <Info label="Retraite">{card.retreat}</Info>}
        {card.illustrator && (
          <Info label="Illustration">
            <span className="inline-flex items-center gap-1">
              <Paintbrush className="size-3.5 text-subtle" /> {card.illustrator}
            </span>
          </Info>
        )}
        {card.regulationMark && <Info label="Marque de règlement">{card.regulationMark}</Info>}
        {card.legal && (
          <Info label="Format">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className={cn('size-3.5', card.legal.standard ? 'text-success' : 'text-subtle')} />
              {card.legal.standard ? 'Standard' : card.legal.expanded ? 'Étendu' : 'Hors format'}
            </span>
          </Info>
        )}
        {card.evolveFrom && <Info label="Évolue de">{card.evolveFrom}</Info>}
        {card.dexId?.length ? <Info label="N° national">{card.dexId.map((n) => `#${String(n).padStart(4, '0')}`).join(', ')}</Info> : null}
      </dl>
    </section>
  )
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{label}</dt>
      <dd className="mt-0.5 flex flex-wrap gap-2 font-semibold">{children}</dd>
    </div>
  )
}
