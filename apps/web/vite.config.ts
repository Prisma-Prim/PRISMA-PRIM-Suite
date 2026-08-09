import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  envPrefix: mode === 'production' ? ['VITE_API_URL', 'VITE_CLERK_'] : 'VITE_',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'e2e/**'],
    setupFiles: ['./src/test/setup.ts'],
  },
}));
