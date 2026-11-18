import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { Toaster } from 'sonner'
import './index.css'
import { AuthProvider } from './lib/auth'
import { SettingsProvider, useSettings } from './lib/settings'
import { router } from './router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 60 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function ThemedToaster() {
  const { resolvedTheme } = useSettings()
  return (
    <Toaster
      theme={resolvedTheme}
      position="top-center"
      richColors
      closeButton
      toastOptions={{ style: { fontFamily: 'var(--font-sans)' } }}
      offset={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
      mobileOffset={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
    />
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <AuthProvider>
          <RouterProvider router={router} />
          <ThemedToaster />
        </AuthProvider>
      </SettingsProvider>
    </QueryClientProvider>
  </StrictMode>,
)
