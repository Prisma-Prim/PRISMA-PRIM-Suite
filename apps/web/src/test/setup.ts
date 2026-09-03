import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// Unit tests assert the relative `/api` fallback of the API client. A
// developer shell that exported the root `.env` for the API server must not
// change that contract, and a test file that calls `vi.unstubAllEnvs()` must
// not reintroduce the exported value for the tests that follow it.
beforeEach(() => {
  vi.stubEnv('VITE_API_URL', undefined);
});

afterEach(cleanup);
