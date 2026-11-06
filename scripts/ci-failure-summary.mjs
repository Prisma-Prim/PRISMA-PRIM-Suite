import { appendFileSync } from 'node:fs';
import { stripVTControlCharacters } from 'node:util';

/** How many failing tests the job summary names before it only counts. */
export const MAXIMUM_LISTED_FAILURES = 25;

const MAXIMUM_LOCATION_LENGTH = 200;
const MAXIMUM_TITLE_LENGTH = 200;
const MAXIMUM_MESSAGE_LENGTH = 300;

/** One inline code span: a single line, no ANSI colour, no backtick, bounded. */
function codeSpan(text, maximumLength) {
  const flat = stripVTControlCharacters(String(text))
    .replace(/\s+/gu, ' ')
    .replaceAll('`', "'")
    .trim();
  const bounded =
    flat.length > maximumLength ? `${flat.slice(0, maximumLength - 1)}…` : flat;
  return `\`${bounded === '' ? '(empty)' : bounded}\``;
}

function firstErrorLine(message) {
  const lines = stripVTControlCharacters(String(message ?? '')).split('\n');
  return (
    lines.map((line) => line.trim()).find((line) => line !== '') ??
    'No error message recorded'
  );
}

/**
 * Markdown for the GitHub job summary: the failing tests of one runner, each
 * with its file, title and first error line. Empty when nothing failed.
 *
 * @param {{
 *   runner: string,
 *   failures: ReadonlyArray<{ location?: string, title: string, message?: string }>,
 *   note?: string,
 * }} input
 */
export function renderFailureSummary({ runner, failures, note }) {
  if (failures.length === 0) return '';
  const lines = [`### Failing tests: ${runner} (${failures.length})`, ''];
  for (const failure of failures.slice(0, MAXIMUM_LISTED_FAILURES)) {
    const where = failure.location
      ? `${codeSpan(failure.location, MAXIMUM_LOCATION_LENGTH)} › `
      : '';
    lines.push(
      `- ${where}${codeSpan(failure.title, MAXIMUM_TITLE_LENGTH)}`,
      `  - ${codeSpan(firstErrorLine(failure.message), MAXIMUM_MESSAGE_LENGTH)}`,
    );
  }
  const omitted = failures.length - MAXIMUM_LISTED_FAILURES;
  if (omitted > 0)
    lines.push(`- …and ${omitted} more; the job log lists every failure.`);
  if (note) lines.push('', note);
  return lines.join('\n');
}

/**
 * Appends the failing-test list to `$GITHUB_STEP_SUMMARY`. It writes nothing
 * outside GitHub Actions or when every test passed, and a summary that cannot
 * be written is reported but never fails the test run.
 */
export function appendFailureSummary(
  input,
  { env = process.env, append = appendFileSync } = {},
) {
  const summaryFile = env.GITHUB_STEP_SUMMARY;
  if (!summaryFile) return false;
  const markdown = renderFailureSummary(input);
  if (markdown === '') return false;
  try {
    append(summaryFile, `\n${markdown}\n`);
    return true;
  } catch (error) {
    console.warn(
      `Could not write the failing-test summary: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}
