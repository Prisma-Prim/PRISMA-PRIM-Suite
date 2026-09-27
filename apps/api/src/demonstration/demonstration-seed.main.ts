import {
  DEMONSTRATION_SEED_EXIT_CODES,
  runDemonstrationSeedCommand,
} from './demonstration-seed.command.js';
import { DEMONSTRATION_SCENARIO_VERSION } from './demonstration-scenario.js';

// Operator entry point: `pnpm demo:seed --confirm-workspace <id>`. The
// manifest is written to standard output as JSON lines.
runDemonstrationSeedCommand({
  argv: process.argv.slice(2),
  environment: process.env,
  write: (line) => process.stdout.write(`${line}\n`),
}).then(
  (result) => {
    process.exitCode = result.exitCode;
  },
  (error: unknown) => {
    // The manifest line carries no detail; the diagnostic goes to standard
    // error for the operator only.
    process.stdout.write(
      `${JSON.stringify({ scenario: DEMONSTRATION_SCENARIO_VERSION, result: 'failed' })}\n`,
    );
    process.stderr.write(
      `Demonstration seed failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
    );
    process.exitCode = DEMONSTRATION_SEED_EXIT_CODES.failed;
  },
);
