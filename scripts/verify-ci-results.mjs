import { fileURLToPath } from 'node:url';

// Always required, whatever the change: the fast checks and the scope
// classification that decides whether the heavy families may be skipped.
const alwaysRequiredJobs = ['checks', 'scope'];
// Skippable only when the scope job succeeded and reported a docs-only change.
const heavyJobs = [
  'api',
  'web_unit',
  'browser',
  'acceptance',
  'build',
  'packaging',
];

export function unsuccessfulJobs(results) {
  if (results === null || typeof results !== 'object' || Array.isArray(results))
    throw new Error('Expected a JSON object.');
  const documentationOnly =
    results.scope?.result === 'success' &&
    results.scope?.outputs?.docs_only === 'true';
  const unsuccessful = alwaysRequiredJobs.filter(
    (job) => results[job]?.result !== 'success',
  );
  for (const job of heavyJobs) {
    const result = results[job]?.result;
    if (result === 'success') continue;
    if (result === 'skipped' && documentationOnly) continue;
    unsuccessful.push(job);
  }
  return unsuccessful.map(
    (job) => `${job}: ${results[job]?.result ?? 'missing'}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const unsuccessful = unsuccessfulJobs(
      JSON.parse(process.env.CI_JOB_RESULTS ?? ''),
    );
    if (unsuccessful.length > 0) {
      console.error(
        'Required CI jobs did not succeed:\n' + unsuccessful.join('\n'),
      );
      process.exitCode = 1;
    } else {
      console.log('All required CI jobs succeeded.');
    }
  } catch {
    console.error(
      'CI_JOB_RESULTS must be a JSON object of required job results.',
    );
    process.exitCode = 1;
  }
}
