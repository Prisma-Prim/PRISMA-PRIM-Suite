const requiredJobs = [
  'checks',
  'api',
  'web_unit',
  'browser',
  'acceptance',
  'build',
  'packaging',
];

try {
  const results = JSON.parse(process.env.CI_JOB_RESULTS ?? '');
  if (
    results === null ||
    typeof results !== 'object' ||
    Array.isArray(results)
  ) {
    throw new Error('Expected a JSON object.');
  }
  const unsuccessful = requiredJobs.filter(
    (job) => results[job]?.result !== 'success',
  );
  if (unsuccessful.length > 0) {
    console.error(
      'Required CI jobs did not succeed:\n' +
        unsuccessful
          .map((job) => `${job}: ${results[job]?.result ?? 'missing'}`)
          .join('\n'),
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
