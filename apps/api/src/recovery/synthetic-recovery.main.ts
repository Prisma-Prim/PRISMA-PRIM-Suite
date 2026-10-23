import { runSyntheticRecoveryCommand } from './synthetic-recovery.command.js';

const cancellation = new AbortController();
const cancel = () => cancellation.abort();
process.once('SIGINT', cancel);
process.once('SIGTERM', cancel);

runSyntheticRecoveryCommand({
  argv: process.argv.slice(2),
  environment: process.env,
  write: (line) => process.stdout.write(`${line}\n`),
  signal: cancellation.signal,
})
  .then(
    (code) => {
      process.exitCode = code;
    },
    () => {
      process.stdout.write(
        `${JSON.stringify({ outcome: 'failed', reason: 'unexpected-failure' })}\n`,
      );
      process.exitCode = 1;
    },
  )
  .finally(() => {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  });
