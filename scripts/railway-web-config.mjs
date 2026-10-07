import { httpsUrl, livePublishableKey } from './railway-config.mjs';

try {
  livePublishableKey(process.env, 'VITE_CLERK_PUBLISHABLE_KEY');
  const url = httpsUrl(process.env, 'VITE_API_URL');
  if (url.pathname !== '/api' || url.search || url.hash)
    throw new Error(
      'VITE_API_URL must end with /api without query or fragment.',
    );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Invalid configuration.',
  );
  process.exitCode = 1;
}
