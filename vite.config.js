import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    cloudflare(),
    tailwindcss(),
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
