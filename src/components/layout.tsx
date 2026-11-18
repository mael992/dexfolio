import {
  BookImage,
  CloudOff,
  Heart,
  House,
  Layers,
  ScanLine,
  Search,
  Settings,
  X,
  type LucideIcon,
} from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { Link, NavLink, Outlet, ScrollRestoration, useNavigate } from 'react-router'
import { useAuth } from '../lib/auth'
import { CardSheetProvider } from '../lib/card-sheet'
import { useCollection, useWishlist } from '../lib/collection-hooks'
import { isSupabaseConfigured } from '../lib/env'
import { useSettings } from '../lib/settings'
import { LANGS } from '../lib/tcgdex'
import { cn, fmtInt, initials, readLocal, writeLocal } from '../lib/utils'
import { Logo } from './Logo'
import { PageSpinner } from './ui'

const CardSheet = lazy(() => import('./CardSheet'))

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Accueil', icon: House, end: true },
  { to: '/extensions', label: 'Extensions', icon: Layers },
  { to: '/dex', label: 'Dex national', icon: BookImage },
  { to: '/recherche', label: 'Recherche', icon: Search },
  { to: '/scanner', label: 'Scanner', icon: ScanLine },
  { to: '/envies', label: 'Envies', icon: Heart },
]

export function AppShell() {
  return (
    <CardSheetProvider>
      <div className="min-h-dvh lg:pl-[272px]">
        <Sidebar />
        <MobileHeader />
        <main className="mx-auto w-full max-w-[1440px] px-4 pb-32 pt-4 sm:px-6 lg:px-10 lg:pb-14 lg:pt-8">
          {!isSupabaseConfigured && <LocalModeBanner />}
          <Suspense fallback={<PageSpinner />}>
            <Outlet />
          </Suspense>
        </main>
        <BottomNav />
        <Suspense fallback={null}>
          <CardSheet />
        </Suspense>
        <ScrollRestoration />
      </div>
    </CardSheetProvider>
  )
}

function Sidebar() {
  const { displayName, user, mode } = useAuth()
  const { cardLang } = useSettings()
  const { index } = useCollection()
  const { data: wishes } = useWishlist()
  const lang = LANGS.find((l) => l.code === cardLang)

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] flex-col border-r border-line bg-elev/80 px-4 py-6 backdrop-blur-xl lg:flex">
      <Link to="/" className="mb-8 px-2" aria-label="Dexfolio, accueil">
        <Logo />
      </Link>

      <nav className="flex flex-1 flex-col gap-1" aria-label="Navigation principale">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'group relative flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition',
                isActive ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-sunken hover:text-fg',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute -left-4 h-6 w-1 rounded-r-full bg-brand" />}
                <item.icon className="size-5" strokeWidth={isActive ? 2.4 : 2} />
                <span className="flex-1">{item.label}</span>
                {item.to === '/envies' && !!wishes?.length && (
                  <span className="rounded-md bg-sunken px-1.5 text-xs tabular-nums text-subtle">{wishes.length}</span>
                )}
              </>
            )}
          </NavLink>
        ))}

        <div className="mt-6 rounded-2xl border border-line bg-gradient-to-br from-brand-soft via-transparent to-accent-soft p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-subtle">Ma collection</div>
          <div className="mt-1 font-display text-3xl font-semibold tabular-nums">{fmtInt(index.uniqueCards)}</div>
          <div className="text-xs text-muted">
            cartes uniques · {fmtInt(index.totalCopies)} exemplaires
          </div>
        </div>
      </nav>

      <NavLink
        to="/reglages"
        className={({ isActive }) =>
          cn('mt-4 flex items-center gap-3 rounded-2xl border p-2.5 transition', isActive ? 'border-brand/40 bg-brand-soft' : 'border-line hover:bg-sunken')
        }
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-info to-[#1d2c5e] font-display text-sm font-semibold text-white">
          {initials(displayName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{mode === 'local' ? 'Mode local' : displayName}</span>
          <span className="block truncate text-xs text-subtle">
            {user?.email ?? 'Sur cet appareil'} · {lang?.short}
          </span>
        </span>
        <Settings className="size-[18px] shrink-0 text-subtle" />
      </NavLink>
    </aside>
  )
}

function MobileHeader() {
  const navigate = useNavigate()
  const { data: wishes } = useWishlist()
  return (
    <header className="pt-safe sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur-xl lg:hidden">
      <div className="flex h-14 items-center gap-2 px-4">
        <Link to="/" aria-label="Accueil">
          <Logo className="[&_svg]:size-8" />
        </Link>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => navigate('/recherche')}
          aria-label="Rechercher une carte"
          className="grid size-10 place-items-center rounded-xl text-muted transition hover:bg-sunken hover:text-fg"
        >
          <Search className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => navigate('/envies')}
          aria-label="Liste d’envies"
          className="relative grid size-10 place-items-center rounded-xl text-muted transition hover:bg-sunken hover:text-fg"
        >
          <Heart className="size-5" />
          {!!wishes?.length && <span className="absolute right-2 top-2 size-2 rounded-full bg-brand ring-2 ring-bg" />}
        </button>
      </div>
    </header>
  )
}

const MOBILE_NAV: (NavItem & { primary?: boolean })[] = [
  { to: '/', label: 'Accueil', icon: House, end: true },
  { to: '/extensions', label: 'Extensions', icon: Layers },
  { to: '/scanner', label: 'Scanner', icon: ScanLine, primary: true },
  { to: '/dex', label: 'Dex', icon: BookImage },
  { to: '/reglages', label: 'Profil', icon: Settings },
]

function BottomNav() {
  return (
    <nav
      aria-label="Navigation principale"
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-elev/85 backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-5 px-2">
        {MOBILE_NAV.map((item) =>
          item.primary ? (
            <NavLink key={item.to} to={item.to} className="relative flex flex-col items-center" aria-label={item.label}>
              {({ isActive }) => (
                <span
                  className={cn(
                    'absolute -top-5 grid size-14 place-items-center rounded-full bg-gradient-to-br from-[#ff6a3d] to-brand text-white shadow-[0_12px_24px_-8px_var(--brand)] ring-4 ring-bg transition active:scale-95',
                    isActive && 'ring-brand-soft',
                  )}
                >
                  <item.icon className="size-6" strokeWidth={2.4} />
                </span>
              )}
            </NavLink>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn('flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition', isActive ? 'text-brand' : 'text-subtle')
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className="size-[22px]" strokeWidth={isActive ? 2.4 : 2} />
                  {item.label}
                </>
              )}
            </NavLink>
          ),
        )}
      </div>
    </nav>
  )
}

function LocalModeBanner() {
  const [hidden, setHidden] = useState(() => readLocal('dexfolio:hide-local-banner', false))
  if (hidden) return null
  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3 text-[13px] sm:text-sm">
      <CloudOff className="mt-0.5 size-5 shrink-0 text-accent-strong" />
      <p className="flex-1 text-fg/90">
        <strong>Mode local</strong> — ta collection reste dans ce navigateur. Branche Supabase (voir le README) pour la
        connexion sécurisée et la synchro entre appareils.
      </p>
      <button
        type="button"
        onClick={() => {
          setHidden(true)
          writeLocal('dexfolio:hide-local-banner', true)
        }}
        aria-label="Masquer ce message"
        className="-m-1 grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-accent/20 hover:text-fg"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
