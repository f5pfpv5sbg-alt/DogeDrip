import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          if (/node_modules[\\/](?:firebase|@firebase)[\\/]/.test(id)) {
            return 'firebase-vendor';
          }

          if (/node_modules[\\/](?:react|react-dom|scheduler)[\\/]/.test(id)) {
            return 'react-vendor';
          }

          if (/node_modules[\\/]lucide-react[\\/]/.test(id)) {
            return 'icons';
          }

          return undefined;
        }
      }
    }
  }
});
