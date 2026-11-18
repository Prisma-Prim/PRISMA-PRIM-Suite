import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { qualifyBatch } from './index.js';
import { preparedInputs, repeatPrepared } from './fixtures.js';
import { loadPrivateInputs, PrivateInputError } from './private-input.js';

const usage =
  'Usage: node dist/dossier-volume-qualification/main.js (--prepared small|medium|large | --corpus DIR) [--concurrency 1|2] [--stop-after N]\nWrites one sanitized JSON summary to stdout. Exit: 0 completed with matched prepared/labelled expectations; 1 extraction/quality failure; 2 invalid input; 3 interrupted. Private corpus must be local, flat and explicitly hashed. No provider or business write.';
export function parseArguments(argv: readonly string[]) {
  let mode:
    | { kind: 'prepared'; size: 'small' | 'medium' | 'large' }
    | { kind: 'private'; directory: string }
    | undefined;
  let concurrency: 1 | 2 = 1;
  let stopAfter: number | undefined;
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (seen.has(flag) || value === undefined) throw new PrivateInputError();
    seen.add(flag);
    if (
      flag === '--prepared' &&
      !mode &&
      (value === 'small' || value === 'medium' || value === 'large')
    )
      mode = { kind: 'prepared', size: value };
    else if (flag === '--corpus' && !mode && value && !value.startsWith('--'))
      mode = { kind: 'private', directory: value };
    else if (flag === '--concurrency' && (value === '1' || value === '2'))
      concurrency = value === '1' ? 1 : 2;
    else if (
      flag === '--stop-after' &&
      /^[1-9][0-9]{0,2}$/u.test(value) &&
      Number(value) <= 200
    )
      stopAfter = Number(value);
    else throw new PrivateInputError();
  }
  if (!mode) throw new PrivateInputError();
  return { mode, concurrency, stopAfter };
}

async function execute() {
  if (isMainThread) {
    if (process.argv.slice(2).join(' ') === '--help') {
      process.stdout.write(`${usage}\n`);
      return;
    }
    // Capture even native parser/library diagnostics, which may contain source strings.
    const worker = new Worker(__filename, {
      argv: process.argv.slice(2),
      stdout: true,
      stderr: true,
    });
    worker.stdout.resume();
    worker.stderr.resume();
    const stop = () => worker.postMessage('stop');
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    let received = false;
    worker.once(
      'message',
      (message: {
        report:
          | Awaited<ReturnType<typeof qualifyBatch>>
          | { error: 'invalid_input' | 'qualification_failed' };
        exit: number;
      }) => {
        received = true;
        process.stdout.write(`${JSON.stringify(message.report)}\n`);
        process.exitCode = message.exit;
      },
    );
    worker.once('error', () => {
      if (!received) process.stdout.write('{"error":"qualification_failed"}\n');
      process.exitCode = 1;
    });
    worker.once('exit', () => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      if (!received) process.exitCode = 1;
    });
    return;
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  parentPort?.on('message', stop);
  try {
    const options = parseArguments(process.argv.slice(2));
    const inputs =
      options.mode.kind === 'prepared'
        ? repeatPrepared(await preparedInputs(), options.mode.size)
        : await loadPrivateInputs(options.mode.directory);
    const report = await qualifyBatch({
      inputs,
      mode: options.mode.kind,
      concurrency: options.concurrency,
      signal: controller.signal,
      stopAfter: options.stopAfter,
    });
    const incorrect =
      report.accounting.failed > 0 ||
      report.observations.some(
        (o) =>
          o.quality &&
          (!o.quality.stateMatched ||
            o.quality.passages.falsePositive ||
            o.quality.passages.falseNegative ||
            o.quality.candidates.falsePositive ||
            o.quality.candidates.falseNegative),
      );
    parentPort?.postMessage({
      report,
      exit: report.status === 'interrupted' ? 3 : incorrect ? 1 : 0,
    });
  } catch (error) {
    parentPort?.postMessage({
      report: {
        error:
          error instanceof PrivateInputError
            ? 'invalid_input'
            : 'qualification_failed',
      },
      exit: error instanceof PrivateInputError ? 2 : 1,
    });
  } finally {
    parentPort?.off('message', stop);
    parentPort?.close();
  }
}

if (require.main === module) void execute();
