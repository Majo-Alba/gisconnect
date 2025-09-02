import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // we serve our own /public/manifest.webmanifest
      registerType: 'autoUpdate',
      manifest: false,

      // Helpful in dev too (doesn't affect production files)
      devOptions: { enabled: true },

      workbox: {
        cleanupOutdatedCaches: true,
        // make sure common assets are precached
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,ttf,woff,woff2,jpg,jpeg,webp}'
        ],

        // SPA fallback for same-origin navigations
        navigateFallback: '/index.html',

        // Runtime caching that improves mobile reliability
        runtimeCaching: [
          // Cache Google Sheets CSVs with a network-first policy (fallback to cache offline)
          {
            urlPattern: ({ url }) =>
              url.hostname === 'docs.google.com' ||
              url.hostname === 'docs.gstatic.com',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'google-sheets-csv',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 }, // 1h
            }
          },

          // Cache product images served from your S3 bucket or CDN (adjust host if needed)
          {
            urlPattern: ({ url }) =>
              /amazonaws\.com$/.test(url.hostname) ||
              /cloudfront\.net$/.test(url.hostname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'product-images',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30d
            }
          },

          // Cache same-origin images/fonts (helps slow mobile)
          {
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin &&
              (request.destination === 'image' || request.destination === 'font'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-assets',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30d
            }
          },

          // Always go to network for API calls (they’re cross-origin anyway, but safe guard)
          {
            urlPattern: ({ url }) =>
              /gisconnect-api\.onrender\.com$/.test(url.hostname),
            handler: 'NetworkOnly',
            method: 'GET'
          },
          {
            urlPattern: ({ url }) =>
              /gisconnect-api\.onrender\.com$/.test(url.hostname),
            handler: 'NetworkOnly',
            method: 'POST'
          }
        ],
      }
    })
  ],

  // These don’t change production behavior, but make local dev smoother.
  server: {
    host: true,
    port: 5173,
  },

  // Optional: better stack traces in Render preview builds too
  build: {
    sourcemap: true,
  }
})

// import { defineConfig } from 'vite'
// import react from '@vitejs/plugin-react'
// import { VitePWA } from 'vite-plugin-pwa'

// export default defineConfig({
//   plugins: [
//     react(),
//     VitePWA({
//       registerType: 'autoUpdate',
//       manifest: false,              // we are serving our own /public/manifest.webmanifest
//       workbox: {
//         globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
//       }
//     })
//   ]
// })
