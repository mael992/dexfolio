import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Content-Security-Policy injectée uniquement au build (en dev, Vite a besoin de scripts inline).
 * GitHub Pages ne permet pas d'en-têtes HTTP personnalisés : la balise <meta> fait office de garde-fou.
 */
function cspPlugin(supabaseUrl: string): Plugin {
  let supabaseOrigins = 'https://*.supabase.co wss://*.supabase.co'
  try {
    if (supabaseUrl) {
      const u = new URL(supabaseUrl)
      supabaseOrigins += ` ${u.origin} ${u.origin.replace(/^http/, 'ws')}`
    }
  } catch {
    /* URL invalide : on garde les valeurs par défaut */
  }
  const policy = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net blob:",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://assets.tcgdex.net",
    "font-src 'self' data:",
    `connect-src 'self' https://api.tcgdex.net https://assets.tcgdex.net https://cdn.jsdelivr.net data: blob: ${supabaseOrigins}`,
    "media-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')
  return {
    name: 'dexfolio-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      )
    },
  }
}

/** GitHub Pages sert 404.html pour les routes inconnues : on y copie l'app (SPA fallback). */
function spaFallbackPlugin(): Plugin {
  let outDir = 'dist'
  return {
    name: 'dexfolio-spa-fallback',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      const index = resolve(outDir, 'index.html')
      if (existsSync(index)) copyFileSync(index, resolve(outDir, '404.html'))
    },
  }
}

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '')
  const base = env.VITE_BASE_PATH || '/'

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      cspPlugin(env.VITE_SUPABASE_URL ?? ''),
      spaFallbackPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png', 'theme-init.js'],
        manifest: {
          id: base,
          name: 'Dexfolio — ta collection Pokémon TCG',
          short_name: 'Dexfolio',
          description: 'Suis ta collection de cartes Pokémon TCG, extension par extension.',
          lang: 'fr',
          theme_color: '#E3350D',
          background_color: '#0A0F1E',
          display: 'standalone',
          orientation: 'portrait',
          start_url: base,
          scope: base,
          categories: ['entertainment', 'utilities'],
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          navigateFallback: `${base}index.html`,
          // Polices : seuls les sous-ensembles latins sont pré-chargés hors-ligne
          globPatterns: ['**/*.{js,css,html,svg,png,ico}', '**/*-latin-*.woff2'],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/assets\.tcgdex\.net\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'tcgdex-images',
                expiration: { maxEntries: 4000, maxAgeSeconds: 60 * 60 * 24 * 90 },
                cacheableResponse: { statuses: [200] },
              },
            },
            {
              urlPattern: /^https:\/\/api\.tcgdex\.net\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'tcgdex-api',
                expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 7 },
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
        },
      }),
    ],
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 900,
    },
  }
})
