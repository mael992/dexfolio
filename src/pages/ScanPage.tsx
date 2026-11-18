import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Camera,
  Check,
  CircleExclamationPoint,
  Cpu,
  ImageUp,
  Keyboard,
  Lightbulb,
  Plus,
  RefreshCw,
  RotateCcw,
  ScanLine,
  ScanText,
  SwitchCamera,
  Undo2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { CardImage } from '../components/cards'
import { SetSymbol } from '../components/sets'
import { Badge, Button, buttonClass, Field, Input, PageHeader, Segmented, Spinner } from '../components/ui'
import { useCardSheet } from '../lib/card-sheet'
import { snapshotFromBrief } from '../lib/collection'
import { useAdjustCard, useCollection } from '../lib/collection-hooks'
import { isSupabaseConfigured } from '../lib/env'
import { useCatalog, useSet, useSetMeta } from '../lib/queries'
import { useQuickAdd } from '../lib/quick-add'
import { useSettings } from '../lib/settings'
import { LANGS, type Lang, type Variant } from '../lib/tcgdex'
import { cn, normNum, readLocal, writeLocal } from '../lib/utils'
import { captureGuide, fileToCanvas, toJpegBase64 } from '../scanner/image'
import {
  fetchScannerStatus,
  guessFromReading,
  LocalScanError,
  localScanErrorMessage,
  scanWithLocalAi,
} from '../scanner/local-ai'
import { CONFIDENT_SCORE, findCandidates, type Candidate, type ScanGuess } from '../scanner/match'

type Mode = 'photo' | 'quick'
type Engine = 'local' | 'ocr'

function initialEngine(): Engine {
  const saved = readLocal<string>('dexfolio:scan-engine', '')
  if (saved === 'local' || saved === 'ocr') return saved
  return isSupabaseConfigured ? 'local' : 'ocr'
}

export default function ScanPage() {
  const [mode, setMode] = useState<Mode>(() => readLocal<Mode>('dexfolio:scan-mode', 'photo'))
  return (
    <div>
      <PageHeader
        eyebrow="Ajouter des cartes"
        title="Scanner"
        subtitle="Photographie une carte pour la reconnaître automatiquement, ou range un paquet en tapant les numéros."
        action={
          <Segmented<Mode>
            value={mode}
            onChange={(m) => {
              setMode(m)
              writeLocal('dexfolio:scan-mode', m)
            }}
            ariaLabel="Mode d’ajout"
            options={[
              { value: 'photo', label: 'Photo', icon: Camera },
              { value: 'quick', label: 'Saisie rapide', icon: Keyboard },
            ]}
          />
        }
      />
      {mode === 'photo' ? <PhotoScanner /> : <QuickEntry />}
    </div>
  )
}

/* ================================================================== */
/* Scanner photo                                                       */
/* ================================================================== */

type CamState = 'off' | 'starting' | 'on' | 'denied' | 'unavailable'
type Phase = 'idle' | 'analyzing' | 'result'

function PhotoScanner() {
  const { cardLang } = useSettings()
  const { catalog } = useCatalog()
  const qc = useQueryClient()
  const [engine, setEngine] = useState<Engine>(initialEngine)
  const { data: scanner } = useQuery({
    queryKey: ['scanner-status'],
    queryFn: fetchScannerStatus,
    enabled: engine === 'local' && isSupabaseConfigured,
    refetchInterval: 20_000,
    staleTime: 10_000,
  })
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const guideRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cam, setCam] = useState<CamState>('off')
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [phase, setPhase] = useState<Phase>('idle')
  const [status, setStatus] = useState('')
  const [shot, setShot] = useState<string | null>(null)
  const [guess, setGuess] = useState<ScanGuess>({})
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const startCamera = useCallback(
    async (face = facing) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCam('unavailable')
        return
      }
      setCam('starting')
      stopCamera()
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: face }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        })
        streamRef.current = stream
        const v = videoRef.current
        if (v) {
          v.srcObject = stream
          await v.play().catch(() => undefined)
        }
        setCam('on')
      } catch (e) {
        setCam((e as DOMException)?.name === 'NotAllowedError' ? 'denied' : 'unavailable')
      }
    },
    [facing, stopCamera],
  )

  useEffect(() => stopCamera, [stopCamera])

  const runMatch = useCallback(
    async (g: ScanGuess) => {
      if (!catalog) return
      setStatus('Recherche dans le catalogue…')
      setPhase('analyzing')
      try {
        const list = await findCandidates(qc, g, catalog, cardLang)
        setCandidates(list)
      } catch {
        setError('Recherche impossible : l’API des cartes ne répond pas.')
      } finally {
        setPhase('result')
      }
    },
    [catalog, qc, cardLang],
  )

  async function analyze(canvas: HTMLCanvasElement) {
    setPhase('analyzing')
    setError(null)
    setCandidates(null)
    setShot(canvas.toDataURL('image/jpeg', 0.7))
    try {
      let g: ScanGuess
      if (engine === 'local') {
        const reading = await scanWithLocalAi(toJpegBase64(canvas, 1100, 0.85), cardLang, setStatus)
        if (!reading.is_pokemon_card) throw new Error('Ce ne semble pas être une carte Pokémon. Recadre et réessaie.')
        g = guessFromReading(reading)
      } else {
        setStatus('Chargement de la lecture locale…')
        const { readCardWithOcr } = await import('../scanner/ocr')
        g = await readCardWithOcr(canvas, cardLang, (p, s) => {
          if (s.includes('recognizing')) setStatus(`Lecture du texte… ${Math.round(p * 100)} %`)
          else if (s.includes('loading')) setStatus('Préparation du moteur de lecture…')
        })
      }
      setGuess(g)
      if (!g.name && !g.number) {
        setError('Rien de lisible sur la photo. Rapproche-toi, évite les reflets, ou corrige les champs ci-dessous.')
        setCandidates([])
        setPhase('result')
        return
      }
      await runMatch(g)
    } catch (e) {
      // Après une mise à jour de l'app, un module à charger à la demande peut avoir changé de nom.
      if (/dynamically imported module|Importing a module script failed|error loading dynamically/i.test((e as Error)?.message ?? '')) {
        window.location.reload()
        return
      }
      setError(e instanceof LocalScanError ? localScanErrorMessage(e) : (e as Error).message)
      setCandidates([])
      setPhase('result')
    }
  }

  function capture() {
    const v = videoRef.current
    const c = containerRef.current
    const g = guideRef.current
    if (!v || !c || !g || !v.videoWidth) return
    void analyze(captureGuide(v, c.getBoundingClientRect(), g.getBoundingClientRect()))
  }

  async function onFile(file: File) {
    try {
      void analyze(await fileToCanvas(file))
    } catch {
      setError('Impossible de lire cette image.')
    }
  }

  function reset() {
    setPhase('idle')
    setCandidates(null)
    setGuess({})
    setError(null)
    setShot(null)
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,440px)_1fr] xl:items-start">
      {/* ------------------------- Viseur ------------------------- */}
      <div className="mx-auto w-full max-w-[480px] space-y-3 xl:sticky xl:top-8">
        <Segmented<Engine>
          value={engine}
          onChange={(e) => {
            setEngine(e)
            writeLocal('dexfolio:scan-engine', e)
          }}
          ariaLabel="Moteur de reconnaissance"
          className="w-full [&>button]:flex-1"
          options={[
            { value: 'local', label: 'IA locale (Qwen)', icon: Cpu },
            { value: 'ocr', label: 'Lecture rapide', icon: ScanText },
          ]}
        />
        {engine === 'local' ? (
          <div className="flex items-start gap-2.5 px-1 text-xs text-muted">
            <span
              className={cn(
                'mt-1 size-2 shrink-0 rounded-full',
                !isSupabaseConfigured || !scanner ? 'bg-subtle' : scanner.online ? 'bg-success shadow-[0_0_8px_var(--success)]' : 'bg-brand',
              )}
              aria-hidden
            />
            <p>
              {!isSupabaseConfigured
                ? 'Nécessite la base Supabase (connexion à l’app).'
                : !scanner
                  ? 'Vérification de ton PC…'
                  : scanner.online
                    ? `Qwen est prêt sur ton PC (${scanner.model ?? 'modèle local'}). La photo transite par ta base, puis est effacée.`
                    : `PC hors ligne : ${scanner.detail}. Utilise la lecture rapide en attendant.`}
            </p>
          </div>
        ) : (
          <p className="px-1 text-xs text-muted">
            Gratuit et sans serveur : le texte est lu dans ton navigateur (nom + numéro). Fonctionne mieux bien éclairé.
          </p>
        )}

        <div
          ref={containerRef}
          className="relative aspect-[3/4] w-full overflow-hidden rounded-[28px] bg-[#05070d] shadow-[var(--shadow-pop)] ring-1 ring-white/5"
        >
          <video ref={videoRef} playsInline muted autoPlay className={cn('absolute inset-0 size-full object-cover', facing === 'user' && '-scale-x-100', cam !== 'on' && 'invisible')} />

          {shot && phase !== 'idle' && <img src={shot} alt="Carte capturée" className="absolute inset-0 size-full object-contain bg-[#05070d]" />}

          {/* Cadre de visée */}
          {cam === 'on' && phase === 'idle' && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div ref={guideRef} className="relative aspect-[63/88] h-[80%] rounded-[18px] shadow-[0_0_0_9999px_rgb(5_7_13/0.55)]">
                {['left-0 top-0 border-l-4 border-t-4 rounded-tl-[18px]', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-[18px]', 'left-0 bottom-0 border-l-4 border-b-4 rounded-bl-[18px]', 'right-0 bottom-0 border-r-4 border-b-4 rounded-br-[18px]'].map((c) => (
                  <span key={c} className={cn('absolute size-9 border-accent', c)} />
                ))}
              </div>
            </div>
          )}
          {phase === 'analyzing' && (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-6 h-1 animate-scan rounded-full bg-gradient-to-r from-transparent via-accent to-transparent shadow-[0_0_24px_4px_rgb(255_203_5/0.6)]" />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/80 to-transparent p-5 text-sm font-semibold text-white">
                <Spinner className="text-accent" /> {status}
              </div>
            </div>
          )}

          {cam !== 'on' && phase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center text-white">
              <div className="grid size-16 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                {cam === 'starting' ? <Spinner className="size-7 text-accent" /> : <Camera className="size-8" />}
              </div>
              <div>
                <p className="font-display text-xl font-semibold">
                  {cam === 'denied' ? 'Accès à la caméra refusé' : cam === 'unavailable' ? 'Caméra indisponible' : 'Prêt à scanner ?'}
                </p>
                <p className="mt-1 text-sm text-white/70">
                  {cam === 'denied'
                    ? 'Autorise la caméra dans les réglages du navigateur, ou importe une photo.'
                    : cam === 'unavailable'
                      ? 'Aucune caméra détectée : importe une photo de ta carte.'
                      : 'La caméra ne s’active que pendant le scan. Aucune image n’est conservée.'}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {cam !== 'unavailable' && (
                  <Button size="lg" icon={Camera} onClick={() => void startCamera()} loading={cam === 'starting'}>
                    Activer la caméra
                  </Button>
                )}
                <Button size="lg" variant="ghost" icon={ImageUp} className="bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={() => fileRef.current?.click()}>
                  Importer
                </Button>
              </div>
            </div>
          )}

          {cam === 'on' && phase === 'idle' && (
            <>
              <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent p-4 text-center text-sm font-semibold text-white">
                Place la carte entière dans le cadre, sans reflet
              </div>
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-around bg-gradient-to-t from-black/70 to-transparent px-6 pb-6 pt-10">
                <button type="button" onClick={() => fileRef.current?.click()} aria-label="Importer une photo" className="grid size-12 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25">
                  <ImageUp className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={capture}
                  aria-label="Prendre la photo"
                  className="grid size-[76px] place-items-center rounded-full border-4 border-white/90 bg-white/10 backdrop-blur transition active:scale-90"
                >
                  <span className="size-14 rounded-full bg-gradient-to-br from-[#ff6a3d] to-brand shadow-[0_0_24px_rgb(227_53_13/0.7)]" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = facing === 'environment' ? 'user' : 'environment'
                    setFacing(next)
                    void startCamera(next)
                  }}
                  aria-label="Changer de caméra"
                  className="grid size-12 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25"
                >
                  <SwitchCamera className="size-5" />
                </button>
              </div>
            </>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onFile(f)
            e.target.value = ''
          }}
        />
      </div>

      {/* ------------------------- Résultats ------------------------- */}
      <div className="min-w-0">
        {phase === 'idle' && <ScanTips engine={engine} />}
        {phase === 'analyzing' && (
          <div className="surface flex items-center gap-4 rounded-3xl p-6">
            <Spinner className="size-7" />
            <div>
              <div className="font-semibold">{status || 'Analyse…'}</div>
              <div className="text-sm text-muted">Quelques secondes…</div>
            </div>
          </div>
        )}
        {phase === 'result' && (
          <ScanResults
            guess={guess}
            candidates={candidates ?? []}
            error={error}
            onRetry={(g) => {
              setError(null)
              setGuess(g)
              void runMatch(g)
            }}
            onNext={() => {
              reset()
              if (cam !== 'on') void startCamera()
            }}
          />
        )}
      </div>
    </div>
  )
}

function ScanTips({ engine }: { engine: Engine }) {
  const tips = [
    'Pose la carte à plat sur un fond uni et sombre.',
    'Évite les reflets : incline légèrement la carte ou le téléphone.',
    'Remplis le cadre : le numéro en bas de la carte doit être net.',
    engine === 'ocr'
      ? 'La lecture rapide se télécharge au premier scan (~5 Mo).'
      : 'Qwen lit une carte en 6 à 15 s sur ton PC, même ancienne ou sous sleeve.',
  ]
  return (
    <div className="space-y-4">
      <div className="surface rounded-3xl p-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Lightbulb className="size-5 text-accent-strong" /> Pour un scan réussi
        </h2>
        <ul className="mt-4 space-y-3">
          {tips.map((t, i) => (
            <li key={t} className="flex gap-3 text-sm text-muted">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand">{i + 1}</span>
              {t}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-3xl border border-dashed border-line p-6 text-sm text-muted">
        <strong className="text-fg">Astuce :</strong> pour ranger un paquet d’une même extension, la{' '}
        <strong className="text-fg">saisie rapide</strong> (numéro + Entrée) est souvent plus rapide que la photo.
      </div>
    </div>
  )
}

function ScanResults({
  guess,
  candidates,
  error,
  onRetry,
  onNext,
}: {
  guess: ScanGuess
  candidates: Candidate[]
  error: string | null
  onRetry(g: ScanGuess): void
  onNext(): void
}) {
  const [name, setName] = useState(guess.name ?? '')
  const [num, setNum] = useState(guess.number ? `${guess.number}${guess.total ? `/${guess.total}` : ''}` : '')
  const [lang, setLang] = useState<Lang | ''>(guess.lang ?? '')

  useEffect(() => {
    setName(guess.name ?? '')
    setNum(guess.number ? `${guess.number}${guess.total ? `/${guess.total}` : ''}` : '')
    setLang(guess.lang ?? '')
  }, [guess])

  function retry(e: FormEvent) {
    e.preventDefault()
    const [n, t] = num.split('/').map((s) => s.trim())
    onRetry({ ...guess, name: name.trim() || undefined, number: n || undefined, total: t || undefined, lang: lang || undefined })
  }

  const best = candidates[0]
  const confident = best && best.score >= CONFIDENT_SCORE

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-brand/30 bg-brand-soft p-4 text-sm">
          <CircleExclamationPoint className="mt-0.5 size-5 shrink-0 text-brand" />
          <p>{error}</p>
        </div>
      )}

      <form onSubmit={retry} className="surface rounded-3xl p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Ce qui a été lu</h2>
          <span className="text-xs text-muted">Corrige si besoin puis relance</span>
        </div>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-[1fr_130px_100px_auto] sm:items-end [&>*:first-child]:col-span-2 sm:[&>*:first-child]:col-span-1">
          <Field label="Nom" htmlFor="scan-name">
            <Input id="scan-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Pikachu" />
          </Field>
          <Field label="Numéro" htmlFor="scan-num">
            <Input id="scan-num" value={num} onChange={(e) => setNum(e.target.value)} placeholder="025/165" />
          </Field>
          <Field label="Langue" htmlFor="scan-lang">
            <select
              id="scan-lang"
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang | '')}
              className="h-11 w-full rounded-xl border border-line bg-elev px-2 font-semibold outline-none focus:border-info"
            >
              <option value="">Auto</option>
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.short}
                </option>
              ))}
            </select>
          </Field>
          <Button type="submit" variant="secondary" icon={RefreshCw} className="h-11">
            Relancer
          </Button>
        </div>
      </form>

      {candidates.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{confident ? 'Carte reconnue' : 'Est-ce l’une de ces cartes ?'}</h2>
            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={onNext}>
              Scanner la suivante
            </Button>
          </div>
          {candidates.map((c, i) => (
            <CandidateRow key={c.card.id} c={c} highlight={i === 0 && !!confident} variantHint={guess.variantHint} onAdded={() => undefined} />
          ))}
        </div>
      ) : (
        !error && (
          <div className="rounded-3xl border border-dashed border-line p-6 text-center text-sm text-muted">
            Aucune carte correspondante. Corrige le nom ou le numéro ci-dessus, ou{' '}
            <Link to="/recherche" className="font-semibold text-info hover:underline">
              cherche-la manuellement
            </Link>
            .
          </div>
        )
      )}
      {(error || candidates.length === 0) && (
        <Button variant="secondary" icon={RotateCcw} onClick={onNext} className="w-full">
          Reprendre une photo
        </Button>
      )}
    </div>
  )
}

function CandidateRow({ c, highlight, variantHint, onAdded }: { c: Candidate; highlight: boolean; variantHint?: Variant | 'unknown'; onAdded(): void }) {
  const { add } = useQuickAdd()
  const { index } = useCollection()
  const { openCard } = useCardSheet()
  const { catalog } = useCatalog()
  const [variant, setVariant] = useState<Variant>(variantHint && variantHint !== 'unknown' ? variantHint : 'normal')
  // Variante touchée par l'utilisateur → prioritaire sur la base ; sinon c'est la suggestion de l'IA, vérifiée
  const [variantChosen, setVariantChosen] = useState(false)
  const [added, setAdded] = useState(0)
  const owned = index.byCard.get(c.card.id)?.total ?? 0
  const set = catalog?.byId.get(c.setId)

  return (
    <div className={cn('surface flex gap-4 rounded-2xl p-3 transition', highlight && 'ring-2 ring-success/60')}>
      <button type="button" onClick={() => openCard(c.card.id)} className="w-[88px] shrink-0 sm:w-[104px]" aria-label={`Voir ${c.card.name}`}>
        <CardImage image={c.card.image} cardId={c.card.id} localId={c.card.localId} name={c.card.name} className="shadow-md" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold">{c.card.name}</div>
            <div className="flex items-center gap-1.5 text-sm text-muted">
              <SetSymbol symbol={set?.symbol} />
              <span className="truncate">{c.setName}</span>
              <span className="font-mono text-xs text-subtle">#{c.card.localId}</span>
            </div>
          </div>
          {highlight && (
            <Badge tone="success">
              <Check className="size-3.5" /> Sûr
            </Badge>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {c.reasons.map((r) => (
            <Badge key={r} tone="info">
              {r}
            </Badge>
          ))}
          {owned > 0 && <Badge tone="success">Déjà ×{owned}</Badge>}
          {c.lang !== 'fr' && <Badge>{c.lang.toUpperCase()}</Badge>}
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
          <Segmented<Variant>
            size="sm"
            value={variant}
            onChange={(v) => {
              setVariant(v)
              setVariantChosen(true)
            }}
            ariaLabel="Variante"
            options={[
              { value: 'normal', label: 'Normale' },
              { value: 'reverse', label: 'Reverse' },
              { value: 'holo', label: 'Holo' },
            ]}
          />
          <Button
            size="sm"
            icon={added ? Check : Plus}
            variant={added ? 'soft' : 'primary'}
            onClick={async () => {
              const ok = await add(c.card.id, { variant, forceVariant: variantChosen, lang: c.lang, notify: true })
              if (ok) {
                setAdded((n) => n + 1)
                onAdded()
              }
            }}
          >
            {added ? `Ajoutée${added > 1 ? ` ×${added}` : ''}` : 'Ajouter'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ================================================================== */
/* Saisie rapide : extension + numéro + Entrée                          */
/* ================================================================== */

interface LogEntry {
  key: string
  cardId: string
  name: string
  localId: string
  image?: string
  variant: Variant
}

function QuickEntry() {
  const { catalog } = useCatalog()
  const { cardLang } = useSettings()
  const [setId, setSetId] = useState<string>(() => readLocal('dexfolio:quick-set', ''))
  const { data: set, isLoading } = useSet(setId || undefined)
  const { data: meta } = useSetMeta(setId || undefined)
  const { add } = useQuickAdd()
  const adjust = useAdjustCard()
  const { index } = useCollection()
  const [num, setNum] = useState('')
  const [variant, setVariant] = useState<Variant | 'auto'>('auto')
  const [log, setLog] = useState<LogEntry[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const effectiveSetId = set?.id ?? setId
  const match = useMemo(() => (num.trim() ? set?.cards.find((c) => normNum(c.localId) === normNum(num.trim())) : undefined), [num, set])
  const owned = match ? (index.byCard.get(match.id)?.total ?? 0) : 0

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!match || !effectiveSetId) return
    const m = meta?.[match.id]
    const snap = snapshotFromBrief(match, effectiveSetId, m)
    const res = await add(match.id, {
      snapshot: snap,
      variants: m ? (m.variants ?? null) : undefined,
      variant: variant === 'auto' ? undefined : variant,
      forceVariant: variant !== 'auto',
    })
    if (res) {
      setLog((l) => [{ key: `${match.id}-${Date.now()}`, cardId: match.id, name: match.name, localId: match.localId, image: match.image, variant: res.variant }, ...l].slice(0, 40))
      setNum('')
      inputRef.current?.focus()
    }
  }

  function undo(entry: LogEntry) {
    const m = meta?.[entry.cardId]
    adjust.mutate({
      card: snapshotFromBrief({ id: entry.cardId, localId: entry.localId, name: entry.name, image: entry.image }, effectiveSetId, m),
      lang: cardLang,
      variant: entry.variant,
      delta: -1,
    })
    setLog((l) => l.filter((x) => x.key !== entry.key))
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,440px)_1fr] xl:items-start">
      <form onSubmit={submit} className="surface space-y-4 rounded-3xl p-5 sm:p-6">
        <Field label="Extension" htmlFor="quick-set">
          <select
            id="quick-set"
            value={setId}
            onChange={(e) => {
              setSetId(e.target.value)
              writeLocal('dexfolio:quick-set', e.target.value)
              setTimeout(() => inputRef.current?.focus(), 50)
            }}
            className="h-11 w-full rounded-xl border border-line bg-elev px-3 font-semibold outline-none focus:border-info"
          >
            <option value="">Choisis une extension…</option>
            {catalog?.series.map((s) => (
              <optgroup key={s.id} label={s.name}>
                {s.sets.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} ({x.cardCount.official})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>

        <Field label="Numéro de la carte" htmlFor="quick-num" hint="Tape le numéro imprimé en bas de la carte puis Entrée. Le zéro initial est facultatif.">
          <Input
            id="quick-num"
            ref={inputRef}
            value={num}
            onChange={(e) => setNum(e.target.value)}
            placeholder={set ? `1 à ${set.cardCount.official}` : '—'}
            disabled={!setId}
            inputMode="text"
            autoComplete="off"
            enterKeyHint="done"
            className="[&_input]:h-14 [&_input]:font-display [&_input]:text-2xl [&_input]:font-semibold"
          />
        </Field>

        <Field label="Variante">
          <Segmented<Variant | 'auto'>
            value={variant}
            onChange={setVariant}
            ariaLabel="Variante"
            className="w-full [&>button]:flex-1"
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'normal', label: 'Normale' },
              { value: 'reverse', label: 'Reverse' },
              { value: 'holo', label: 'Holo' },
            ]}
          />
        </Field>

        <div className="flex items-center gap-4 rounded-2xl bg-sunken p-3">
          <div className="w-20 shrink-0">
            {match ? (
              <CardImage image={match.image} cardId={match.id} localId={match.localId} name={match.name} className="shadow-md" />
            ) : (
              <div className="grid aspect-[63/88] place-items-center card-radius border-2 border-dashed border-line text-subtle">
                {isLoading ? <Spinner /> : <ScanLine className="size-6" />}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            {match ? (
              <>
                <div className="truncate text-lg font-semibold">{match.name}</div>
                <div className="text-sm text-muted">
                  #{match.localId} · {set?.name}
                </div>
                {owned > 0 && <Badge tone="success" className="mt-1">Déjà ×{owned}</Badge>}
              </>
            ) : (
              <div className="text-sm text-muted">{!setId ? 'Commence par choisir une extension.' : num ? 'Aucune carte avec ce numéro.' : 'L’aperçu de la carte apparaîtra ici.'}</div>
            )}
          </div>
        </div>

        <Button type="submit" size="lg" icon={Plus} className="w-full" disabled={!match}>
          Ajouter à ma collection
        </Button>
      </form>

      <div className="min-w-0">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Ajoutées pendant cette session</h2>
          {setId && (
            <Link to={`/extensions/${setId}`} className={buttonClass('ghost', 'sm')}>
              Voir l’extension
            </Link>
          )}
        </div>
        {log.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-line p-8 text-center text-sm text-muted">
            Les cartes ajoutées s’afficheront ici, avec la possibilité d’annuler.
          </div>
        ) : (
          <ul className="space-y-2">
            {log.map((e) => (
              <li key={e.key} className="surface flex animate-fade-up items-center gap-3 rounded-2xl p-2 pr-3">
                <div className="w-11 shrink-0">
                  <CardImage image={e.image} cardId={e.cardId} localId={e.localId} name={e.name} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{e.name}</div>
                  <div className="text-xs text-muted">
                    #{e.localId} · {e.variant === 'normal' ? 'Normale' : e.variant === 'reverse' ? 'Reverse' : e.variant === 'holo' ? 'Holo' : e.variant}
                  </div>
                </div>
                <Button variant="ghost" size="sm" icon={Undo2} onClick={() => undo(e)}>
                  Annuler
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
