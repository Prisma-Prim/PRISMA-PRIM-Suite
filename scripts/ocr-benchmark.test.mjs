import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('offline OCR metric and input boundaries pass independent stdlib-only worked examples', () => {
  execFileSync(
    'python3',
    [
      '-m',
      'unittest',
      'discover',
      '-s',
      'tools/ocr-benchmark',
      '-p',
      'test_*.py',
    ],
    { cwd: fileURLToPath(new URL('..', import.meta.url)), timeout: 10_000 },
  );
});
