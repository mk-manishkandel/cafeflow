import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import viteCompression from 'vite-plugin-compression';

// Read version from constants/version.ts for cache busting
const versionPath = path.resolve('./constants/version.ts');
const versionContent = fs.readFileSync(versionPath, 'utf-8');
const versionMatch = versionContent.match(/export const APP_VERSION = '([^']+)';?/);
const APP_VERSION = versionMatch ? versionMatch[1].replace(/\./g, '_') : '1_0_0';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 4000,
      host: '0.0.0.0',
      allowedHosts: env.VITE_ALLOWED_HOSTS ? env.VITE_ALLOWED_HOSTS.split(',') : ['localhost', '127.0.0.1'],
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://127.0.0.1:3001',
          changeOrigin: true,
          secure: false,
        },
        '/uploads': {
          target: env.VITE_API_URL || 'http://127.0.0.1:3001',
          changeOrigin: true,
          secure: false,
        }
      }
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api/, /^\/uploads/],
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          maximumFileSizeToCacheInBytes: 5000000,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-stylesheets',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
              },
            },
            {
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
              // Use NetworkFirst so menu images stay updated if changed on server
              handler: 'NetworkFirst',
              options: {
                cacheName: 'images-cache',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24, // Reduced to 1 day
                },
              },
            },
            {
              urlPattern: /\/api\//,
              // Strictly NetworkOnly for API data
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /\/version\.json/,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /\/manifest\.webmanifest$/,
              handler: 'NetworkFirst',
            },
            {
              // Cache static assets (CSS, JS, Web Workers)
              urlPattern: /\.(?:js|css|worker\.js)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'static-resources',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 Days
                },
              },
            },
          ],
        },
        manifest: {
          name: 'CafeFlow',
          short_name: 'CafeFlow',
          description: 'CafeFlow Cafeteria Management System',
          theme_color: '#4F46E5',
          start_url: '/dashboard',
          display: 'standalone',
          background_color: '#ffffff',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        }
      }),
      viteCompression({
        algorithm: 'gzip',
        ext: '.gz',
      }),
      viteCompression({
        algorithm: 'brotliCompress',
        ext: '.br',
      })
    ],
    define: {
      // API keys are intentionally NOT exposed to the frontend
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    esbuild: {
      drop: mode === 'production' ? ['console', 'debugger'] : [],
    },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          // Include version in chunk names for automatic cache invalidation
          entryFileNames: `assets/[name]-${APP_VERSION}-[hash].js`,
          chunkFileNames: `assets/[name]-${APP_VERSION}-[hash].js`,
          assetFileNames: `assets/[name]-${APP_VERSION}-[hash].[ext]`,
          manualChunks(id) {
            // recharts gets its own lazy chunk so it only loads when dashboard/reporting renders
            if (id.includes('recharts')) return 'vendor-recharts';
            if (id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom') || id.includes('node_modules/react/')) return 'vendor-react';
            if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
            if (id.includes('node_modules/axios') || id.includes('node_modules/clsx') || id.includes('node_modules/zod')) return 'vendor-utils';
            if (
              id.includes('components/ui/UIContext') ||
              id.includes('components/Sidebar') ||
              id.includes('components/Footer')
            ) return 'ui-core';
          }
        }
      }
    }
  };
});
