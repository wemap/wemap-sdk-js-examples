import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(__dirname, '../..');

// HTTPS configuration
const httpsConfig = (() => {
  const certPath = resolve(rootDir, '.certs/cert.pem');
  const keyPath = resolve(rootDir, '.certs/key.pem');
  
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    };
  }
  
  return undefined;
})();

export default defineConfig({
  root: __dirname,
  server: {
    ...(httpsConfig && { https: httpsConfig }),
    host: true, // Allow access from network (for phone testing)
    port: 4200,
    strictPort: false, // Try next available port if 4200 is taken
  },
  build: {
    outDir: '../../dist/apps/examples',
    commonjsOptions: {
      ignoreTryCatch: false,
    },
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        combined: resolve(__dirname, 'combined.html'),
        'combined-gnss': resolve(__dirname, 'combined-gnss.html'),
        'gnss-location-source': resolve(__dirname, 'gnss-location-source.html'),
        'vps-location-source': resolve(__dirname, 'vps-location-source.html'),
        routing: resolve(__dirname, 'routing.html'),
        'map-matching': resolve(__dirname, 'map-matching.html'),
        'map-matching-vps': resolve(__dirname, 'map-matching-vps.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@wemap/core': resolve(__dirname, '../../packages/core/index.ts'),
      '@wemap/positioning': resolve(__dirname, '../../packages/positioning/index.ts'),
      '@wemap/routing': resolve(__dirname, '../../packages/routing/index.ts'),
      '@wemap/camera': resolve(__dirname, '../../packages/camera/index.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['@wemap/core', '@wemap/positioning', '@wemap/routing', '@wemap/camera'],
  },
});

