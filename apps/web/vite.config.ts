import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const acceptanceApiUrl = process.env.ACCEPTANCE_API_URL;
  return {
    envPrefix:
      mode === 'production' ? ['VITE_API_URL', 'VITE_CLERK_'] : 'VITE_',
    plugins: [react()],
    preview: acceptanceApiUrl
      ? {
          proxy: {
            '/api': {
              target: acceptanceApiUrl,
            },
          },
        }
      : undefined,
    test: {
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      setupFiles: ['./src/test/setup.ts'],
      // App-level jsdom renders time out at 5 s when every core runs a
      // worker (#571). Half the cores keeps the same wall time locally and
      // is a no-op on 2-vCPU CI runners, where Vitest already uses one.
      maxWorkers: '50%',
      // Full App renders under a second concurrent suite still approach 5 s;
      // 15 s keeps them stable while a genuine hang still fails.
      testTimeout: 15_000,
    },
  };
});
