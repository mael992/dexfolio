import { RotateCcw } from 'lucide-react'
import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate, useLocation, useRouteError } from 'react-router'
import { AppShell } from './components/layout'
import { LogoMark } from './components/Logo'
import { Button } from './components/ui'
import { useAuth } from './lib/auth'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const SetsPage = lazy(() => import('./pages/SetsPage'))
const SetPage = lazy(() => import('./pages/SetPage'))
const DexPage = lazy(() => import('./pages/DexPage'))
const SearchPage = lazy(() => import('./pages/SearchPage'))
const ScanPage = lazy(() => import('./pages/ScanPage'))
const WishlistPage = lazy(() => import('./pages/WishlistPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

export function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center gap-4">
        <LogoMark className="size-16 animate-pulse drop-shadow-[0_12px_24px_rgb(227_53_13/0.4)]" />
        <span className="font-display text-lg font-semibold text-muted">Dexfolio</span>
      </div>
    </div>
  )
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Splash />}>{children}</Suspense>
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { status, recovery } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <Splash />
  if (recovery) return <Navigate to="/nouveau-mot-de-passe" replace />
  if (status === 'signedOut') return <Navigate to="/connexion" replace state={{ from: location }} />
  return children
}

function RouteError() {
  const error = useRouteError() as Error | undefined
  const isChunkError = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(error?.message ?? '')
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="surface max-w-md rounded-3xl p-8 text-center">
        <LogoMark className="mx-auto size-14" />
        <h1 className="mt-4 text-2xl font-semibold">{isChunkError ? 'Nouvelle version disponible' : 'Oups, une erreur est survenue'}</h1>
        <p className="mt-2 text-sm text-muted">
          {isChunkError ? 'L’application a été mise à jour. Recharge la page pour continuer.' : error?.message || 'Erreur inconnue.'}
        </p>
        <Button className="mt-6" icon={RotateCcw} onClick={() => window.location.reload()}>
          Recharger
        </Button>
      </div>
    </div>
  )
}

const basename = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/'

export const router = createBrowserRouter(
  [
    {
      path: '/connexion',
      element: (
        <Lazy>
          <LoginPage />
        </Lazy>
      ),
      errorElement: <RouteError />,
    },
    {
      path: '/nouveau-mot-de-passe',
      element: (
        <Lazy>
          <ResetPasswordPage />
        </Lazy>
      ),
      errorElement: <RouteError />,
    },
    {
      path: '/',
      element: (
        <RequireAuth>
          <AppShell />
        </RequireAuth>
      ),
      errorElement: <RouteError />,
      children: [
        { index: true, element: <DashboardPage /> },
        { path: 'extensions', element: <SetsPage /> },
        { path: 'extensions/:setId', element: <SetPage /> },
        { path: 'dex', element: <DexPage /> },
        { path: 'recherche', element: <SearchPage /> },
        { path: 'scanner', element: <ScanPage /> },
        { path: 'envies', element: <WishlistPage /> },
        { path: 'reglages', element: <SettingsPage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  { basename },
)
