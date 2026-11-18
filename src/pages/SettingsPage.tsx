import { useQueryClient } from '@tanstack/react-query'
import {
  Database,
  Download,
  FileSpreadsheet,
  Info,
  Languages,
  Lock,
  LogOut,
  Monitor,
  Moon,
  Palette,
  ScanLine,
  Sun,
  Trash,
  Upload,
  User,
} from 'lucide-react'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button, Field, Input, PageHeader, Segmented, Sheet } from '../components/ui'
import { authErrorMessage, useAuth } from '../lib/auth'
import { sanitizeImport, type ExportFile } from '../lib/collection'
import { useCollection, useWishlist } from '../lib/collection-hooks'
import { isSupabaseConfigured } from '../lib/env'
import { useSettings, type ThemePref } from '../lib/settings'
import { supabase } from '../lib/supabase'
import { LANGS, type Lang } from '../lib/tcgdex'
import { downloadFile, fmtInt, initials } from '../lib/utils'

export default function SettingsPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Profil" title="Réglages" subtitle="Ton compte, tes préférences et tes données." />
      <div className="space-y-6">
        <AccountSection />
        <PreferencesSection />
        <DataSection />
        <ScannerSection />
        <AboutSection />
      </div>
    </div>
  )
}

function Section({ icon: Icon, title, children, description }: { icon: typeof User; title: string; description?: string; children: ReactNode }) {
  return (
    <section className="surface rounded-3xl p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
          <Icon className="size-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function AccountSection() {
  const { user, displayName, signOut, mode } = useAuth()
  const [name, setName] = useState(displayName)
  const [savingName, setSavingName] = useState(false)
  const [pwd, setPwd] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [savingPwd, setSavingPwd] = useState(false)

  if (mode === 'local' || !supabase) {
    return (
      <Section icon={User} title="Compte" description="Mode local : aucune connexion requise.">
        <p className="text-sm text-muted">
          Ta collection est enregistrée dans ce navigateur. Pour sécuriser tes données avec un compte et les retrouver sur
          tous tes appareils, configure Supabase (voir le README du dépôt). Pense à exporter régulièrement tes données.
        </p>
      </Section>
    )
  }

  async function saveName(e: FormEvent) {
    e.preventDefault()
    setSavingName(true)
    const { error } = await supabase!.auth.updateUser({ data: { display_name: name.trim().slice(0, 40) } })
    setSavingName(false)
    if (error) toast.error(authErrorMessage(error))
    else toast.success('Nom mis à jour')
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault()
    if (pwd.length < 8) return toast.error('Au moins 8 caractères.')
    if (pwd !== pwd2) return toast.error('Les deux mots de passe ne correspondent pas.')
    setSavingPwd(true)
    const { error } = await supabase!.auth.updateUser({ password: pwd })
    setSavingPwd(false)
    if (error) toast.error(authErrorMessage(error))
    else {
      toast.success('Mot de passe modifié')
      setPwd('')
      setPwd2('')
    }
  }

  return (
    <Section icon={User} title="Compte" description="Connexion sécurisée par Supabase Auth.">
      <div className="mb-6 flex items-center gap-4 rounded-2xl bg-sunken p-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-info to-[#1d2c5e] font-display text-xl font-semibold text-white">
          {initials(displayName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{displayName}</div>
          <div className="truncate text-sm text-muted">{user?.email}</div>
        </div>
        <Button variant="danger" icon={LogOut} onClick={() => void signOut()}>
          <span className="hidden sm:inline">Déconnexion</span>
        </Button>
      </div>

      <form onSubmit={saveName} className="flex items-end gap-2">
        <Field label="Nom affiché" htmlFor="display-name">
          <Input id="display-name" icon={User} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </Field>
        <Button type="submit" variant="secondary" loading={savingName} className="h-11">
          Enregistrer
        </Button>
      </form>

      <form onSubmit={savePassword} className="mt-6 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Nouveau mot de passe" htmlFor="new-pwd">
          <Input id="new-pwd" type="password" icon={Lock} autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} minLength={8} />
        </Field>
        <Field label="Confirmation" htmlFor="new-pwd2">
          <Input id="new-pwd2" type="password" icon={Lock} autoComplete="new-password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} minLength={8} />
        </Field>
        <Button type="submit" variant="secondary" loading={savingPwd} disabled={!pwd} className="h-11">
          Changer
        </Button>
      </form>
    </Section>
  )
}

function PreferencesSection() {
  const { cardLang, setCardLang, theme, setTheme } = useSettings()
  return (
    <Section icon={Palette} title="Préférences">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <Languages className="size-4 text-subtle" /> Langue des cartes
            </div>
            <p className="text-sm text-muted">Noms, images et extensions affichés dans cette langue.</p>
          </div>
          <select
            value={cardLang}
            onChange={(e) => setCardLang(e.target.value as Lang)}
            className="h-10 rounded-xl border border-line bg-sunken px-3 font-semibold outline-none focus:border-info"
            aria-label="Langue des cartes"
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold">Thème</div>
            <p className="text-sm text-muted">Clair, sombre ou automatique selon ton appareil.</p>
          </div>
          <Segmented<ThemePref>
            value={theme}
            onChange={setTheme}
            ariaLabel="Thème"
            options={[
              { value: 'system', label: 'Auto', icon: Monitor },
              { value: 'light', label: 'Clair', icon: Sun },
              { value: 'dark', label: 'Sombre', icon: Moon },
            ]}
          />
        </div>
      </div>
    </Section>
  )
}

function DataSection() {
  const { repo, userKey } = useAuth()
  const { index } = useCollection()
  const { data: wishes = [] } = useWishlist()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const stamp = new Date().toISOString().slice(0, 10)

  function exportJson() {
    const file: ExportFile = { app: 'dexfolio', version: 1, exportedAt: new Date().toISOString(), collection: index.items, wishlist: wishes }
    downloadFile(`dexfolio-${stamp}.json`, JSON.stringify(file, null, 2), 'application/json')
  }

  function exportCsv() {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const head = ['card_id', 'set_id', 'numero', 'nom', 'variante', 'langue', 'quantite', 'rarete', 'ajoutee_le']
    const rows = index.items.map((i) => [i.card_id, i.set_id, i.card_local_id, i.card_name, i.variant, i.lang, i.quantity, i.rarity, i.created_at].map(esc).join(';'))
    downloadFile(`dexfolio-${stamp}.csv`, '﻿' + [head.join(';'), ...rows].join('\n'), 'text/csv;charset=utf-8')
  }

  async function importFile(file: File) {
    if (file.size > 5_000_000) return toast.error('Fichier trop volumineux (5 Mo max).')
    setBusy(true)
    try {
      const data = sanitizeImport(JSON.parse(await file.text()))
      if (!data.collection.length && !data.wishlist.length) throw new Error('Aucune donnée Dexfolio valide dans ce fichier.')
      const replace = window.confirm(
        `${data.collection.length} lignes de collection et ${data.wishlist.length} envies trouvées.\n\nOK = remplacer ta collection actuelle\nAnnuler = fusionner avec ta collection`,
      )
      await repo.importData(data, replace ? 'replace' : 'merge')
      await qc.invalidateQueries({ queryKey: ['collection', userKey] })
      await qc.invalidateQueries({ queryKey: ['wishlist', userKey] })
      toast.success('Import terminé')
    } catch (e) {
      toast.error('Import impossible', { description: (e as Error).message })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function clearAll() {
    setBusy(true)
    try {
      await repo.clearAll()
      await qc.invalidateQueries({ queryKey: ['collection', userKey] })
      await qc.invalidateQueries({ queryKey: ['wishlist', userKey] })
      toast.success('Collection vidée')
      setConfirmOpen(false)
      setConfirmText('')
    } catch (e) {
      toast.error('Suppression impossible', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section icon={Database} title="Mes données" description={`${fmtInt(index.uniqueCards)} cartes uniques · ${fmtInt(index.totalCopies)} exemplaires · ${wishes.length} envies`}>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon={Download} onClick={exportJson}>
          Exporter (JSON)
        </Button>
        <Button variant="secondary" icon={FileSpreadsheet} onClick={exportCsv}>
          Exporter (CSV)
        </Button>
        <Button variant="secondary" icon={Upload} loading={busy} onClick={() => fileRef.current?.click()}>
          Importer
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
        <Button variant="danger" icon={Trash} onClick={() => setConfirmOpen(true)} className="sm:ml-auto">
          Tout supprimer
        </Button>
      </div>

      <Sheet open={confirmOpen} onClose={() => setConfirmOpen(false)} size="md" title="Supprimer toute la collection">
        <div className="space-y-4 p-6 pt-8">
          <h3 className="pr-10 text-2xl font-semibold">Supprimer toute ta collection ?</h3>
          <p className="text-sm text-muted">
            Les {fmtInt(index.items.length)} lignes de ta collection et tes {wishes.length} envies seront définitivement
            supprimées. Cette action est irréversible — pense à exporter tes données avant.
          </p>
          <Field label="Tape SUPPRIMER pour confirmer" htmlFor="confirm-delete">
            <Input id="confirm-delete" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Annuler
            </Button>
            <Button variant="primary" icon={Trash} disabled={confirmText !== 'SUPPRIMER'} loading={busy} onClick={() => void clearAll()}>
              Supprimer définitivement
            </Button>
          </div>
        </div>
      </Sheet>
    </Section>
  )
}

function ScannerSection() {
  return (
    <Section icon={ScanLine} title="Scanner de cartes" description="Comment fonctionne la reconnaissance">
      <ul className="space-y-2 text-sm text-muted">
        <li>
          <strong className="text-fg">IA locale (Qwen)</strong> — la photo est lue par le modèle Qwen qui tourne sur ton PC
          (Ollama, carte graphique). Aucun modèle distant : la photo transite par ta base
          {isSupabaseConfigured ? '' : ' Supabase'} le temps de l’analyse, puis elle est effacée. Le PC doit être allumé
          avec le scanner Dexfolio lancé.
        </li>
        <li>
          <strong className="text-fg">Lecture rapide (OCR)</strong> — gratuite, tout se passe dans ton navigateur : le
          numéro imprimé (ex. 025/165) et le nom sont lus puis rapprochés du catalogue.
        </li>
        <li>
          <strong className="text-fg">Saisie rapide</strong> — tape juste « 25/165 » ou le nom : souvent le plus rapide pour
          ranger un paquet de cartes d’une même extension.
        </li>
      </ul>
    </Section>
  )
}

function AboutSection() {
  return (
    <Section icon={Info} title="À propos">
      <div className="space-y-2 text-sm text-muted">
        <p>
          <strong className="text-fg">Dexfolio</strong> est un projet de fan gratuit et non officiel. Pokémon, le JCC
          Pokémon et les noms associés sont des marques de Nintendo, Creatures Inc., GAME FREAK inc. et The Pokémon
          Company. Ce site n’est ni affilié ni approuvé par ces sociétés.
        </p>
        <p>
          Données, images et prix des cartes fournis par l’API ouverte{' '}
          <a href="https://tcgdex.dev" target="_blank" rel="noopener noreferrer" className="font-semibold text-info hover:underline">
            TCGdex
          </a>
          . Les cotes proviennent de Cardmarket et TCGplayer via TCGdex et sont indicatives.
        </p>
      </div>
    </Section>
  )
}
