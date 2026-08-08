const requiredHeadings = [
  '## Outcome',
  '## Verification',
  '## Review',
  '## Agent environment retrospective',
];

export function stripHtmlComments(body) {
  return body.replace(/<!--[\s\S]*?-->/g, '');
}

export function validatePullRequestBody(body) {
  const visibleBody = stripHtmlComments(body ?? '');
  const errors = [];

  for (const heading of requiredHeadings) {
    if (!visibleBody.includes(heading)) {
      errors.push(`Missing required heading: ${heading}`);
    }
  }

  if (!/^Closes\s+#\d+\s*$/im.test(visibleBody)) {
    errors.push('Add an issue-closing line in the form: Closes #24');
  }

  if (/^Closes\s+#\s*$/im.test(visibleBody)) {
    errors.push('Replace the empty Closes # placeholder with an issue number.');
  }

  const retrospective =
    visibleBody.split('## Agent environment retrospective')[1] ?? '';
  const noFriction = /none observed/i.test(retrospective);
  const frictionRow =
    /\|[^\n]+\|[^\n]+\|[^\n]+\|\s*(Confirmed|Suspected|Unknown)\s*\|/i.test(
      retrospective,
    ) && !/\|\s*None\s*\|/i.test(retrospective);

  if (!noFriction && !frictionRow) {
    errors.push(
      "Complete the retrospective with a friction row or an explicit 'none observed' declaration.",
    );
  }

  for (const placeholder of ['Harness', 'Environment', 'OS/runtime']) {
    if (new RegExp(`^- ${placeholder}:\\s*$`, 'im').test(retrospective)) {
      errors.push(`Replace the empty retrospective field: ${placeholder}.`);
    }
  }

  return errors;
}

export function main() {
  const errors = validatePullRequestBody(process.env.PR_BODY ?? '');
  const advisory = process.argv.includes('--advisory');

  if (errors.length === 0) {
    process.stdout.write(
      'PR description includes the required agent governance sections.\n',
    );
    return;
  }

  for (const error of errors) {
    const prefix = advisory ? '::warning::' : 'ERROR ';
    process.stderr.write(`${prefix}${error}\n`);
  }

  if (!advisory) {
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('validate-pr-description.mjs')) {
  main();
}
