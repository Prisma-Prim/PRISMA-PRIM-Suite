import { defineConfig } from 'vitest/config';

// Explicit PostgreSQL commands fail on missing prerequisites on every OS.
export default defineConfig({
  test: {
    fileParallelism: false,
    env: {
      REQUIRE_ACCESS_POSTGRES: 'true',
      REQUIRE_COMPANY_POSTGRES: 'true',
      REQUIRE_CLIENT_POSTGRES: 'true',
    },
  },
});
