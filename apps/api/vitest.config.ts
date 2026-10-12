import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Each PostgreSQL-backed REST file creates and migrates its own database.
    // Measured on a 16-thread host (#571): one worker per core timed out 19
    // of 109 files, while 6 workers passed all of them and finished sooner.
    // 40% gives 6 there and stays 1 on 2-vCPU CI runners.
    maxWorkers: '40%',
    // Closing a REST harness drops its database; under load that can exceed
    // the 10 s default while still finishing. A genuine hang still fails.
    hookTimeout: 30_000,
  },
});
