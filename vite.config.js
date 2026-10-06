import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import versionStamp from './tools/vite-version-stamp.mjs';

export default defineConfig({
  plugins: [
    cloudflare(),
    tailwindcss(),
    // ?v= stamps on the pages' scripts, the build id, /version.json (Phase 29)
    versionStamp(),
  ],
  environments: {
    client: {
      build: {
        rollupOptions: {
          input: {
            main: 'index.html',
            admin: 'admin.html',
          },
        },
      },
    },
  },
});
