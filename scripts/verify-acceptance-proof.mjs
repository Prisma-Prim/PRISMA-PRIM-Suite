import { existsSync, readFileSync } from 'node:fs';
import { appendFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { nodeTestResultsSchema } from './node-test-results-reporter.mjs';

// Blocks a pull request whose "## Acceptance proof" section does not tie
// every acceptance criterion of the issues it closes to a test that passed in
// the same CI run, with desktop and narrow screenshots when it changes web UI
// source. Rule: docs/agents/acceptance-proof.md. It is a
// deterministic reader of the pull request, its comments and the CI result
// files: it never starts a model or an agent.

const families = ['scripts', 'api', 'web_unit', 'browser', 'acceptance'];
const kinds = new Map([
  ['ui', 'UI'],
  ['behaviour', 'behaviour'],
  ['behavior', 'behaviour'],
  ['bug fix', 'bug fix'],
  ['bugfix', 'bug fix'],
  ['refactor', 'refactor'],
  ['docs', 'docs'],
  ['documentation', 'docs'],
  ['tooling', 'tooling'],
]);
// Only these criteria may be proved by a command or be not applicable.
const commandKinds = new Set(['docs', 'tooling']);
const widths = ['desktop', 'narrow'];
const template = '.github/pull_request_template.md';
const approverVariable = 'PROOF_EXCEPTION_APPROVERS';

const toPosix = (file) => file.replaceAll('\\', '/');
const stripComments = (text) => text.replace(/<!--[\s\S]*?-->/gu, '');
const lines = (text) => text.replaceAll('\r\n', '\n').split('\n');
const normalizeTitle = (title) =>
  title.replaceAll('›', '>').replace(/\s+/gu, ' ').trim();

/** The lines under the first heading that matches, up to the next heading of the same or a higher level. */
function section(text, heading) {
  let level = 0;
  let fence = null;
  let body = null;
  for (const line of lines(stripComments(text ?? ''))) {
    const marker = /^ {0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
    if (marker && (!fence || marker.startsWith(fence))) {
      fence = fence ? null : marker;
      body?.push(line);
      continue;
    }
    const title = fence ? null : /^ {0,3}(#{1,6})\s+(.*?)[\s#]*$/u.exec(line);
    if (body === null) {
      if (title && heading.test(title[2])) {
        level = title[1].length;
        body = [];
      }
    } else if (title && title[1].length <= level) {
      break;
    } else {
      body.push(line);
    }
  }
  return body;
}

/** Top-level numbered, bulleted or checkbox items of the "Acceptance criteria" section, numbered as rendered. */
export function acceptanceCriteria(issueBody) {
  const criteria = [];
  for (const line of section(issueBody, /^acceptance criteria\b/iu) ?? []) {
    const item = /^(?:\d+[.)]|[-*+])\s+(?:\[[ xX]\]\s+)?(\S.*)$/u.exec(line);
    if (item)
      criteria.push({ number: criteria.length + 1, text: item[1].trim() });
  }
  return criteria;
}

/** The text outside comments, fenced code blocks and code spans. */
function proseOf(text) {
  let fence = null;
  const kept = [];
  for (const line of lines(stripComments(text ?? ''))) {
    const marker = /^ {0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
    if (marker && (!fence || marker.startsWith(fence)))
      fence = fence ? null : marker;
    else if (!fence) kept.push(line.replace(/`[^`]*`/gu, ''));
  }
  return kept.join('\n');
}

/** Issues of this repository that the body closes with a GitHub closing keyword. */
export function closedIssueNumbers(body, repository) {
  const name = repository.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const reference = new RegExp(
    String.raw`\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b:?\s+(?:https://github\.com/${name}/issues/|(?:${name})?#)(\d+)\b`,
    'giu',
  );
  return [
    ...new Set(
      [...proseOf(body).matchAll(reference)].map((match) => Number(match[1])),
    ),
  ];
}

/** Web UI source: what the browser renders, never tests, fixtures or notes. */
export function isWebUiSource(file) {
  if (file === 'apps/web/index.html' || file.startsWith('apps/web/public/'))
    return true;
  return (
    file.startsWith('apps/web/src/') &&
    !file.startsWith('apps/web/src/test/') &&
    !file.endsWith('.md') &&
    !/\.(?:test|test-fixtures?|test-support|fixture)\.[cm]?[jt]sx?$/u.test(file)
  );
}

/** The CI test family that runs a test file, or null when CI runs none. */
function familyOf(file) {
  if (file.startsWith('/') || file.split('/').includes('..')) return null;
  if (file.startsWith('scripts/')) return 'scripts';
  if (file.startsWith('apps/api/')) return 'api';
  if (/^apps\/web\/e2e\/.+\.acceptance\.spec\.ts$/u.test(file))
    return 'acceptance';
  if (file.startsWith('apps/web/e2e/')) return 'browser';
  if (file.startsWith('apps/web/src/')) return 'web_unit';
  return null;
}

function widthOf(project) {
  return widths.find((width) =>
    new RegExp(`(?:^|-)${width}$`, 'u').test(project ?? ''),
  );
}

function* playwrightTests(suite, titles) {
  for (const spec of suite.specs ?? [])
    for (const test of spec.tests ?? [])
      yield { file: spec.file, titlePath: [...titles, spec.title], test };
  for (const child of suite.suites ?? [])
    yield* playwrightTests(child, [...titles, child.title]);
}

const playwrightStatus = { expected: 'passed', skipped: 'skipped' };
const vitestStatus = { passed: 'passed', failed: 'failed' };

/**
 * Reads the CI result files of one run: `<family>[-<part>].json` written by
 * Playwright's and Vitest's JSON reporters or by node-test-results-reporter.
 * Each record names a repository file, a title path, a project (Playwright),
 * a status and the screenshots present in the downloaded browser evidence.
 */
export async function readTestResults({
  directory,
  evidenceDirectory,
  workspace,
  families: included = families,
}) {
  const root = toPosix(workspace).replace(/\/+$/u, '');
  const uploadedEvidence = `${root}/apps/web/test-results/`;
  const repositoryPath = (file) => {
    const posix = toPosix(String(file));
    return posix.startsWith(`${root}/`) ? posix.slice(root.length + 1) : null;
  };
  const screenshots = (attachments) =>
    (Array.isArray(attachments) ? attachments : [])
      .filter(
        (attachment) =>
          attachment?.contentType === 'image/png' &&
          typeof attachment.path === 'string',
      )
      .map((attachment) => toPosix(attachment.path))
      .filter((file) => file.startsWith(uploadedEvidence))
      .map((file) => file.slice(uploadedEvidence.length))
      .filter((file) =>
        existsSync(path.join(evidenceDirectory, ...file.split('/'))),
      );

  function parse(report) {
    if (report?.schema === nodeTestResultsSchema && Array.isArray(report.tests))
      return report.tests.map((test) => ({
        file: repositoryPath(test.file),
        titlePath: test.titlePath,
        project: null,
        status: ['passed', 'skipped'].includes(test.status)
          ? test.status
          : 'failed',
        screenshots: [],
      }));
    if (Array.isArray(report?.testResults))
      return report.testResults.flatMap((file) =>
        (file.assertionResults ?? []).map((test) => ({
          file: repositoryPath(file.name),
          titlePath: [...(test.ancestorTitles ?? []), test.title],
          project: null,
          status: vitestStatus[test.status] ?? 'skipped',
          screenshots: [],
        })),
      );
    if (
      typeof report?.config?.rootDir === 'string' &&
      Array.isArray(report.suites)
    )
      return report.suites.flatMap((fileSuite) =>
        [...playwrightTests(fileSuite, [])].map(
          ({ file, titlePath, test }) => ({
            file: repositoryPath(`${toPosix(report.config.rootDir)}/${file}`),
            titlePath,
            project: test.projectName ?? null,
            status: playwrightStatus[test.status] ?? 'failed',
            screenshots: screenshots(test.results?.at(-1)?.attachments),
          }),
        ),
      );
    return null;
  }

  let names = [];
  try {
    names = (await readdir(directory)).sort();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const present = new Set();
  const records = [];
  const unreadable = [];
  for (const name of names) {
    const family =
      /^(scripts|api|web_unit|browser|acceptance)(?:-[\w.-]+)?\.json$/u.exec(
        name,
      )?.[1];
    if (!family || !included.includes(family)) continue;
    let parsed;
    try {
      parsed = parse(
        JSON.parse(await readFile(path.join(directory, name), 'utf8')),
      );
    } catch {
      parsed = null;
    }
    if (!parsed) {
      unreadable.push(name);
      continue;
    }
    present.add(family);
    for (const record of parsed)
      if (
        record.file &&
        Array.isArray(record.titlePath) &&
        record.titlePath.every((title) => typeof title === 'string')
      )
        records.push({ ...record, family });
  }
  return { families: [...present], records, unreadable };
}

function tableCells(line) {
  let row = line.trim();
  if (!row.startsWith('|')) return null;
  row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  return row
    .split(/(?<!\\)\|/u)
    .map((cell) => cell.replaceAll('\\|', '|').trim());
}

/** The rows of the first table in the section, by header name. */
function proofTable(sectionLines) {
  const table = [];
  for (const line of sectionLines) {
    const cells = tableCells(line);
    if (cells) table.push(cells);
    else if (table.length) break;
  }
  if (!table.length) return { rows: [], header: true };
  const column = (pattern) =>
    table[0].findIndex((cell) => pattern.test(cell.replace(/[*_]/gu, '')));
  const columns = {
    label: column(/^criterion/iu),
    kind: column(/^kind/iu),
    functional: column(/^functional/iu),
    visual: column(/^visual/iu),
  };
  if (Object.values(columns).some((index) => index === -1))
    return { rows: [], header: false };
  const rows = table
    .slice(1)
    .filter((cells) => !cells.every((cell) => /^:?-+:?$/u.test(cell)))
    .filter((cells) => cells.some((cell) => cell !== ''))
    .map((cells) => ({
      label: cells[columns.label] ?? '',
      kind: cells[columns.kind] ?? '',
      functional: cells[columns.functional] ?? '',
      visual: cells[columns.visual] ?? '',
    }));
  return { rows, header: true };
}

/**
 * Test citations, commands and a "not applicable" reason. A test citation is
 * `<file> :: <title>`, where the file is the one CI reports (a helper module
 * that defines the tests included), or a whole `*.test.*` or `*.spec.*` file.
 */
function proofCell(cell) {
  const tests = [];
  const commands = [];
  for (const [, span] of cell.matchAll(/`([^`]+)`/gu)) {
    const text = span.trim();
    const test =
      /^(?:\.\/)?(\S+\.[cm]?[jt]sx?)\s+::\s+(\S.*)$/u.exec(text) ??
      /^(?:\.\/)?(\S+\.(?:test|spec)\.[cm]?[jt]sx?)$/u.exec(text);
    if (test)
      tests.push({
        text: `\`${text}\``,
        file: test[1],
        title: test[2] ? normalizeTitle(test[2]) : null,
      });
    else commands.push(text);
  }
  const prose = cell.replace(/`[^`]*`/gu, '').trim();
  const notApplicable = /^(?:not applicable|n\/a)\b\s*[:—–-]?\s*(.*)$/iu.exec(
    prose,
  );
  return {
    tests,
    commands,
    notApplicable: notApplicable ? notApplicable[1].trim() : undefined,
  };
}

function lineValue(sectionLines, label) {
  for (const line of sectionLines) {
    const match = new RegExp(
      String.raw`^\s*(?:[-*]\s+)?\**${label}\**\s*:\**\s*(.*?)\s*$`,
      'iu',
    ).exec(line);
    if (match) return match[1];
  }
  return '';
}

const redGreen = String.raw`red\s*(?:-|→|->|to)\s*green`;

/** Verifies one pull request. The input is data only; the caller fetches it. */
export function verifyAcceptanceProof({
  repository,
  pullRequest,
  issues,
  changedFiles,
  results,
  comments,
  approvers,
  readSource = () => null,
  reusedFamilies = {},
}) {
  const failures = [];
  const notes = [];
  const body = pullRequest.body ?? '';

  const criteriaIssues = [];
  for (const issue of issues) {
    if (issue.pullRequest) {
      notes.push(
        `#${issue.number} is a pull request, so a closing keyword neither closes it nor brings acceptance criteria.`,
      );
      continue;
    }
    if (issue.body === null) {
      failures.push(
        `Issue #${issue.number}, closed by this pull request, could not be read, so its acceptance criteria are unknown.`,
      );
      continue;
    }
    const criteria = acceptanceCriteria(issue.body);
    if (criteria.length)
      criteriaIssues.push({ number: issue.number, criteria });
    else
      notes.push(
        `Issue #${issue.number} has no acceptance criteria section, so the rows state this pull request's own claims.`,
      );
  }
  if (!issues.some((issue) => !issue.pullRequest))
    notes.push(
      'This pull request closes no issue, so the rows state its own claims.',
    );

  const sectionLines = section(body, /^acceptance proof$/iu);
  if (!sectionLines)
    failures.push(
      `The pull request body has no "## Acceptance proof" section; add it from ${template}.`,
    );
  const table = proofTable(sectionLines ?? []);
  if (!table.header)
    failures.push(
      'The Acceptance proof table needs the columns Criterion, Kind, Functional proof and Visual proof.',
    );
  const { rows } = table;

  // Which criterion each row proves.
  const covered = new Set();
  const rowFailures = [];
  for (const [index, row] of rows.entries()) {
    const id = /^(?:#(\d+)\s*[.:/-]?\s*)?(?:AC\s*)?(\d+)\.?$/iu.exec(
      row.label.replace(/[*_`]/gu, ''),
    );
    if (!row.label) {
      rowFailures.push(`Row ${index + 1} names no criterion.`);
      continue;
    }
    if (!id || !criteriaIssues.length) continue;
    const issueNumber = id[1]
      ? Number(id[1])
      : criteriaIssues.length === 1
        ? criteriaIssues[0].number
        : null;
    const issue = criteriaIssues.find((entry) => entry.number === issueNumber);
    if (issueNumber === null)
      rowFailures.push(
        `Row "${row.label}" must name its issue, for example "#${criteriaIssues[0].number}.1", because this pull request closes several issues.`,
      );
    else if (!issue)
      rowFailures.push(
        `Row "${row.label}" names issue #${issueNumber}, which this pull request does not close with acceptance criteria.`,
      );
    else if (Number(id[2]) < 1 || Number(id[2]) > issue.criteria.length)
      rowFailures.push(
        `Row "${row.label}" names no acceptance criterion of #${issueNumber} (it has 1 to ${issue.criteria.length}).`,
      );
    else covered.add(`${issueNumber}.${Number(id[2])}`);
  }
  for (const issue of criteriaIssues)
    for (const criterion of issue.criteria)
      if (!covered.has(`${issue.number}.${criterion.number}`)) {
        const text =
          criterion.text.length > 120
            ? `${criterion.text.slice(0, 119)}…`
            : criterion.text;
        failures.push(
          `Criterion ${criterion.number} of #${issue.number} has no row: "${text}"`,
        );
      }
  if (!criteriaIssues.length && !rows.length)
    failures.push(
      'This pull request closes no issue with acceptance criteria, so its Acceptance proof table must list its own claims as criteria, at least one row.',
    );
  failures.push(...rowFailures);

  function locate(citation, family) {
    if (!results.families.includes(family)) return { family, missing: true };
    const inFile = results.records.filter(
      (record) => record.file === citation.file,
    );
    if (!inFile.length)
      return {
        reason: `did not run in this CI run (the ${family} results have no test from this file).`,
      };
    const matches =
      citation.title === null
        ? inFile
        : inFile.filter(
            (record) =>
              normalizeTitle(record.titlePath.join(' > ')) === citation.title ||
              normalizeTitle(record.titlePath.at(-1)) === citation.title,
          );
    if (!matches.length)
      return {
        reason: `did not run in this CI run (the ${family} results have no test with that title in this file).`,
      };
    return { matches };
  }

  function functionalProblem(citation) {
    const family = familyOf(citation.file);
    if (!family)
      return `is not in a test family that CI runs (${families.slice(0, -1).join(', ')} or ${families.at(-1)}).`;
    const found = locate(citation, family);
    if (found.missing) {
      const run = reusedFamilies[family];
      if (!run)
        return `did not run in this CI run (there are no ${family} results).`;
      const source = readSource(citation.file);
      const lastTitle = citation.title?.split(' > ').at(-1);
      if (source === null || (lastTitle && !source.includes(lastTitle)))
        return `is absent from the suite (the ${family} results were reused from CI run ${run}, so only its presence in the source can be checked).`;
      notes.push(
        `${citation.text} was not rerun: the ${family} results were reused from CI run ${run}, so only its presence in the source was checked.`,
      );
      return null;
    }
    if (found.reason) return found.reason;
    if (found.matches.some((record) => record.status === 'failed'))
      return 'failed in this run.';
    if (!found.matches.some((record) => record.status === 'passed'))
      return 'was skipped in this run.';
    return null;
  }

  function visualProblem(citation) {
    if (familyOf(citation.file) !== 'acceptance')
      return 'is not an acceptance journey test; visual proof must cite apps/web/e2e/*.acceptance.spec.ts.';
    const found = locate(citation, 'acceptance');
    if (found.missing)
      return 'did not run in this CI run (there are no acceptance results).';
    if (found.reason) return found.reason;
    for (const width of widths)
      if (
        !found.matches.some(
          (record) =>
            widthOf(record.project) === width &&
            record.status === 'passed' &&
            record.screenshots.length > 0,
        )
      )
        return `has no passing ${width} result with a screenshot in this run's browser evidence.`;
    return null;
  }

  const notApplicableReason =
    '"Not applicable" needs a reason, for example "Not applicable: the criterion is an owner setting".';
  let visuallyProved = false;
  let bugFix = false;
  for (const [index, row] of rows.entries()) {
    const name = row.label ? `Row "${row.label}"` : `Row ${index + 1}`;
    const kindText = row.kind.replace(/[*_`]/gu, '').trim();
    const kind = kinds.get(kindText.toLowerCase().replace(/\s+/gu, ' '));
    if (!kind) {
      failures.push(
        `${name}: unknown kind "${kindText}"; use UI, behaviour, bug fix, refactor, docs or tooling.`,
      );
      continue;
    }
    bugFix ||= kind === 'bug fix';

    const functional = proofCell(row.functional);
    const needsTest = `${name}: a ${kind} criterion needs functional proof that cites a test (\`<file> :: <test title>\`); a command proves only documentation or tooling criteria.`;
    if (functional.notApplicable !== undefined && !functional.tests.length) {
      if (!commandKinds.has(kind)) failures.push(needsTest);
      else if (!functional.notApplicable)
        failures.push(`${name}: ${notApplicableReason}`);
    } else if (commandKinds.has(kind)) {
      if (!functional.tests.length && !functional.commands.length)
        failures.push(
          `${name}: functional proof is missing; cite a test, a command or "Not applicable: <reason>".`,
        );
    } else if (!functional.tests.length) failures.push(needsTest);
    for (const citation of functional.tests) {
      const problem = functionalProblem(citation);
      if (problem) failures.push(`${name}: ${citation.text} ${problem}`);
    }

    const visual = proofCell(row.visual);
    if (kind === 'UI' && !visual.tests.length)
      failures.push(
        `${name}: a UI criterion needs visual proof from an acceptance journey test (apps/web/e2e/*.acceptance.spec.ts) that produced desktop and narrow screenshots in this run.`,
      );
    else if (visual.notApplicable === '' && !visual.tests.length)
      failures.push(`${name}: ${notApplicableReason}`);
    for (const citation of visual.tests) {
      const problem = visualProblem(citation);
      if (problem) failures.push(`${name}: ${citation.text} ${problem}`);
      else visuallyProved = true;
    }
  }

  const uiFiles = changedFiles.filter(isWebUiSource);
  if (uiFiles.length && !visuallyProved) {
    const listed =
      uiFiles.length > 3
        ? `${uiFiles.slice(0, 3).join(', ')} and ${uiFiles.length - 3} more`
        : uiFiles.join(', ');
    failures.push(
      `This pull request changes web UI source (${listed}), so at least one row needs visual proof from an acceptance journey test that produced desktop and narrow screenshots in this run.`,
    );
  }
  if (bugFix && !lineValue(sectionLines ?? [], redGreen))
    failures.push(
      'A bug fix row needs a "Red-green:" line in the section stating that its regression test failed before the fix and passes after it.',
    );

  for (const file of results.unreadable ?? [])
    notes.push(`The CI result file ${file} could not be read.`);

  const exception = verifyException({
    claim: lineValue(sectionLines ?? [], 'exception'),
    repository,
    number: pullRequest.number,
    comments,
    approvers,
  });
  if (exception.problem) failures.push(exception.problem);
  return {
    passed: failures.length === 0 || exception.granted !== null,
    failures,
    notes,
    rows: rows.length,
    exception: exception.granted,
  };
}

function verifyException({ claim, repository, number, comments, approvers }) {
  const none = { granted: null, problem: null };
  if (/^(?:|none|no|n\/a|-|—)\.?$/iu.test(claim)) return none;
  const fail = (problem) => ({ granted: null, problem });
  const link =
    /https:\/\/github\.com\/([^/\s]+\/[^/\s]+)\/(?:pull|issues)\/(\d+)#issuecomment-(\d+)/u.exec(
      claim,
    );
  if (!link)
    return fail(
      `The Exception line must link an approver's comment on this pull request (https://github.com/${repository}/pull/${number}#issuecomment-<id>).`,
    );
  const [url, linkedRepository, linkedNumber, commentId] = link;
  if (
    linkedRepository.toLowerCase() !== repository.toLowerCase() ||
    Number(linkedNumber) !== number
  )
    return fail(
      `The Exception line links ${url}, but it must link a comment on this pull request (#${number}).`,
    );
  const authorized = (approvers ?? [])
    .map((login) => login.trim().replace(/^@/u, '').toLowerCase())
    .filter(Boolean);
  if (!authorized.length)
    return fail(
      `The exception ${url} cannot be verified because no authorized approver is configured (the repository variable ${approverVariable} is empty or unset).`,
    );
  const comment = comments.find((entry) => String(entry.id) === commentId);
  if (!comment)
    return fail(
      `The exception link ${url} is not a comment on this pull request.`,
    );
  if (!authorized.includes(comment.author.toLowerCase()))
    return fail(
      `The exception comment ${comment.url} was posted by ${comment.author}, who is not an authorized approver.`,
    );
  const reason = lineValue(lines(comment.body), 'acceptance proof exception');
  if (!reason)
    return fail(
      `The exception comment ${comment.url} does not state "Acceptance proof exception: <reason>".`,
    );
  return {
    granted: { author: comment.author, reason, url: comment.url },
    problem: null,
  };
}

/** Read-only GitHub REST adapter; a 404 is "absent", other errors throw. */
export function githubSource({
  fetch,
  token,
  repository,
  apiUrl = 'https://api.github.com',
}) {
  async function request(route) {
    const response = await fetch(`${apiUrl}/repos/${repository}/${route}`, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'user-agent': 'acceptance-proof-check',
        'x-github-api-version': '2022-11-28',
      },
    });
    if (response.status === 404) return null;
    if (!response.ok)
      throw new Error(`GitHub answered ${response.status} for ${route}.`);
    return response.json();
  }
  async function pages(route) {
    const items = [];
    for (let page = 1; page <= 30; page += 1) {
      const batch = await request(`${route}?per_page=100&page=${page}`);
      if (!Array.isArray(batch))
        throw new Error(`GitHub returned no list for ${route}.`);
      items.push(...batch);
      if (batch.length < 100) break;
    }
    return items;
  }
  return {
    async pullRequest(number) {
      const pullRequest = await request(`pulls/${number}`);
      if (!pullRequest)
        throw new Error(`Pull request #${number} was not found.`);
      return { number: pullRequest.number, body: pullRequest.body ?? '' };
    },
    async changedFiles(number) {
      return (await pages(`pulls/${number}/files`)).flatMap((file) =>
        [file.filename, file.previous_filename].filter(
          (name) => typeof name === 'string',
        ),
      );
    },
    async issue(number) {
      const issue = await request(`issues/${number}`);
      if (issue?.pull_request) return { number, body: null, pullRequest: true };
      return { number, body: issue ? (issue.body ?? '') : null };
    },
    async comments(number) {
      return (await pages(`issues/${number}/comments`)).map((comment) => ({
        id: comment.id,
        author: comment.user?.login ?? '',
        body: comment.body ?? '',
        url: comment.html_url,
      }));
    },
  };
}

function report(verdict, { number, issues, runId }) {
  const closes = issues.length
    ? `closes ${issues.map((issue) => `#${issue.number}`).join(', ')}`
    : 'closes no issue';
  const list = (items) => items.map((item) => `- ${item}`);
  const rerun = `Fix the "## Acceptance proof" section of the pull request body (format and rule in docs/agents/acceptance-proof.md), then rerun this job with \`gh run rerun ${runId ?? '<run-id>'} --failed\` or "Re-run failed jobs" on the run page. Editing the body or posting a comment does not start CI by itself.`;
  const notes = verdict.notes.length
    ? ['', 'Notes:', ...list(verdict.notes)]
    : [];
  if (verdict.exception)
    return {
      status: 'passed by exception',
      text: [
        `Acceptance proof: passed by exception for pull request #${number}.`,
        `Exception granted by ${verdict.exception.author}: ${verdict.exception.reason}`,
        `Link: ${verdict.exception.url}`,
        ...(verdict.failures.length
          ? ['', 'Waived findings:', ...list(verdict.failures)]
          : []),
        ...notes,
      ],
    };
  if (verdict.passed)
    return {
      status: 'passed',
      text: [
        `Acceptance proof: passed for pull request #${number} (${verdict.rows} ${verdict.rows === 1 ? 'row' : 'rows'}; ${closes}).`,
        ...notes,
      ],
    };
  return {
    status: 'failed',
    text: [
      `Acceptance proof: failed for pull request #${number}.`,
      ...list(verdict.failures),
      ...notes,
      '',
      rerun,
    ],
  };
}

/** Runs the check for one CI event and returns the process exit status. */
export async function runAcceptanceProof({
  event,
  log = console.log,
  source,
  number,
  repository,
  approvers,
  results,
  reusedFamilies = {},
  readSource,
  summaryFile,
  runId,
}) {
  if (event === 'merge_group') {
    log(
      'Acceptance proof is enforced on the pull request. A pull request enters a merge group only after its own quality check, which runs this verification, has passed.',
    );
    return 0;
  }
  if (event !== 'pull_request') {
    log(
      `Acceptance proof applies to pull requests; this ${event || 'unknown'} run has no pull request to verify.`,
    );
    return 0;
  }
  const pullRequest = await source.pullRequest(number);
  const issues = await Promise.all(
    closedIssueNumbers(pullRequest.body, repository).map((issue) =>
      source.issue(issue),
    ),
  );
  const [changedFiles, comments] = await Promise.all([
    source.changedFiles(number),
    source.comments(number),
  ]);
  const verdict = verifyAcceptanceProof({
    repository,
    pullRequest,
    issues,
    changedFiles,
    results,
    comments,
    approvers,
    readSource,
    reusedFamilies,
  });
  const { status, text } = report(verdict, {
    number: pullRequest.number,
    issues,
    runId,
  });
  log(text.join('\n'));
  if (summaryFile)
    await appendFile(
      summaryFile,
      `### Acceptance proof: ${status}\n\n${text.slice(1).join('\n')}\n`,
    );
  return verdict.passed ? 0 : 1;
}

const parseApprovers = (value) =>
  typeof value === 'string' ? value.split(/[\s,]+/u).filter(Boolean) : null;

/** API proof reused from an earlier run with identical backend inputs. */
function reusedFamiliesOf(jobs) {
  const scope = jobs?.scope;
  const run = scope?.outputs?.proof_run;
  return scope?.result === 'success' &&
    /^[1-9][0-9]*$/u.test(run ?? '') &&
    scope.outputs.reuse_api === 'true' &&
    jobs.api?.result === 'skipped'
    ? { api: Number(run) }
    : {};
}

// Offline demonstration and local check: a directory holding context.json
// and pull-request.md stands in for GitHub (see the committed fixtures).
async function runFixture(directory, environment) {
  const context = JSON.parse(
    await readFile(path.join(directory, 'context.json'), 'utf8'),
  );
  const body = await readFile(path.join(directory, 'pull-request.md'), 'utf8');
  const source = {
    pullRequest: async () => ({ number: context.pullRequest, body }),
    changedFiles: async () => context.changedFiles ?? [],
    comments: async () => context.comments ?? [],
    async issue(number) {
      try {
        const file = path.resolve(directory, context.issues, `${number}.md`);
        return { number, body: await readFile(file, 'utf8') };
      } catch {
        return { number, body: null };
      }
    },
  };
  return runAcceptanceProof({
    event: 'pull_request',
    source,
    number: context.pullRequest,
    repository: context.repository,
    approvers: parseApprovers(context.approvers),
    results: await readTestResults({
      directory: path.resolve(directory, context.results),
      evidenceDirectory: path.resolve(directory, context.evidence),
      workspace: context.workspace,
    }),
    readSource: () => null,
    summaryFile: environment.GITHUB_STEP_SUMMARY,
  });
}

async function main(argv, environment) {
  const fixture = argv.indexOf('--fixture');
  if (fixture !== -1) return runFixture(argv[fixture + 1], environment);
  const event = environment.GITHUB_EVENT_NAME;
  if (event !== 'pull_request') return runAcceptanceProof({ event });
  const number = environment.PULL_REQUEST_NUMBER ?? '';
  if (!/^[1-9][0-9]*$/u.test(number) || !environment.GH_TOKEN)
    throw new Error('PULL_REQUEST_NUMBER and GH_TOKEN are required.');
  const workspace = environment.GITHUB_WORKSPACE ?? process.cwd();
  let jobs;
  try {
    jobs = JSON.parse(environment.CI_JOB_RESULTS ?? 'null');
  } catch {
    jobs = null;
  }
  return runAcceptanceProof({
    event,
    source: githubSource({
      fetch,
      token: environment.GH_TOKEN,
      repository: environment.GITHUB_REPOSITORY,
      apiUrl: environment.GITHUB_API_URL,
    }),
    number: Number(number),
    repository: environment.GITHUB_REPOSITORY,
    approvers: parseApprovers(environment[approverVariable]),
    results: await readTestResults({
      directory: path.resolve(workspace, 'ci-test-results'),
      evidenceDirectory: path.resolve(workspace, 'browser-evidence'),
      workspace,
    }),
    reusedFamilies: reusedFamiliesOf(jobs),
    readSource(file) {
      try {
        return readFileSync(path.join(workspace, file), 'utf8');
      } catch {
        return null;
      }
    },
    summaryFile: environment.GITHUB_STEP_SUMMARY,
    runId: environment.GITHUB_RUN_ID,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2), process.env);
  } catch (error) {
    // Fail closed: an unreadable pull request or API error never passes.
    const message = `Acceptance proof could not be verified: ${error instanceof Error ? error.message : String(error)}`;
    console.error(message);
    if (process.env.GITHUB_STEP_SUMMARY)
      await appendFile(
        process.env.GITHUB_STEP_SUMMARY,
        `### Acceptance proof: not verified\n\n${message}\n`,
      );
    process.exitCode = 1;
  }
}
