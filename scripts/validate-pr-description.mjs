import { createHash } from 'node:crypto';

import {
  getComplexFeaturePreflightDisposition,
  validateComplexFeaturePreflightContents,
  withoutCodeExamples,
} from './validate-complex-feature-preflight.mjs';

export function governanceRevisionToken({
  pullRequestNumber,
  headSha,
  pullRequestBody,
  issueNumber,
  issueBody,
}) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        pullRequestNumber,
        headSha,
        pullRequestBody ?? '',
        issueNumber,
        issueBody ?? '',
      ]),
    )
    .digest('hex');
}

const requiredHeadings = [
  '## Outcome',
  '## Change classification',
  '## Verification',
  '## Review',
  '## Agent environment retrospective',
];

const requiredClassificationFields = [
  'Class',
  'Product contract changed',
  'Preflight',
];
const optionalClassificationFields = [
  'High-risk boundaries',
  'Exemption reason',
  'Normative owner',
  'Pre-code Spec review',
];
const classificationFields = [
  ...requiredClassificationFields,
  ...optionalClassificationFields,
];
const changeClasses = new Set([
  'mechanical',
  'product-contract',
  'implementation',
]);
const highRiskBoundaries = new Set([
  'authentication',
  'authorization',
  'permissions',
  'workspace-isolation',
  'migration',
  'activity-log',
  'privacy',
  'async-identity',
  'concurrency',
  'transversal',
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function fieldValues(body, label) {
  const pattern = new RegExp(
    `^\\s*-\\s*${escapeRegExp(label)}:[^\\S\\r\\n]*(.*?)[^\\S\\r\\n]*$`,
    'gimu',
  );
  return [...body.matchAll(pattern)].map((match) => match[1].trim());
}

function isPlaceholder(value) {
  return /^(?:todo|tbd|placeholder|replace\b)/iu.test(value.trim());
}

function isConcrete(value) {
  return Boolean(
    value &&
    !/^(?:n\/?a|none|not-applicable|-)$/iu.test(value) &&
    !isPlaceholder(value),
  );
}

function normalizePreflightDisposition(value) {
  const trimmed = value.trim();
  const linked = /^linked\s+(.+)$/iu.exec(trimmed);
  return linked ? `linked ${linked[1]}` : trimmed.toLowerCase();
}

function visiblePullRequestBody(body) {
  return stripHtmlComments(withoutCodeExamples(body ?? ''));
}

export function getPullRequestClassification(body) {
  const visibleBody = visiblePullRequestBody(body);
  const values = Object.fromEntries(
    classificationFields.map((field) => [
      field,
      fieldValues(visibleBody, field),
    ]),
  );
  if (
    requiredClassificationFields.some((field) => values[field].length !== 1)
  ) {
    return null;
  }
  return Object.fromEntries(
    classificationFields.map((field) => [field, values[field][0] ?? null]),
  );
}

export function closingIssueNumber(body) {
  const visibleBody = visiblePullRequestBody(body);
  const closingTargets = [
    ...visibleBody.matchAll(
      /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:[a-z0-9_.-]+\/[a-z0-9_.-]+)?#(\d+)\b/gimu,
    ),
  ];
  const canonical = [...visibleBody.matchAll(/^Closes\s+#(\d+)\s*$/gimu)];
  return closingTargets.length === 1 && canonical.length === 1
    ? Number(canonical[0][1])
    : null;
}

export function stripHtmlComments(body) {
  return body.replace(/<!--[\s\S]*?-->/gu, '').replace(/<!--[\s\S]*$/u, '');
}

export function validatePullRequestBody(body) {
  const visibleBody = visiblePullRequestBody(body);
  const errors = [];

  for (const heading of requiredHeadings) {
    if (!visibleBody.includes(heading)) {
      errors.push(`Missing required heading: ${heading}`);
    }
  }

  const values = Object.fromEntries(
    classificationFields.map((field) => [
      field,
      fieldValues(visibleBody, field),
    ]),
  );
  for (const field of requiredClassificationFields) {
    if (values[field].length !== 1) {
      errors.push(`Provide exactly one ${field} field.`);
    } else if (isPlaceholder(values[field][0])) {
      errors.push(`Replace the placeholder ${field} value.`);
    }
  }
  for (const field of optionalClassificationFields) {
    if (values[field].length > 1) {
      errors.push(`Provide at most one ${field} field.`);
    } else if (values[field].length === 1 && isPlaceholder(values[field][0])) {
      errors.push(`Replace the placeholder ${field} value.`);
    }
  }

  const classification = getPullRequestClassification(visibleBody);
  if (classification) {
    const changeClass = classification.Class.toLowerCase();
    const contractChanged =
      classification['Product contract changed'].toLowerCase();
    const boundaryValues = (classification['High-risk boundaries'] ?? 'none')
      .toLowerCase()
      .split(',')
      .map((boundary) => boundary.trim())
      .filter(Boolean);
    const preflight = normalizePreflightDisposition(classification.Preflight);
    const specReview = classification['Pre-code Spec review']?.toLowerCase();
    const exemptionReason = classification['Exemption reason'];
    const normativeOwner = classification['Normative owner'];

    if (!changeClasses.has(changeClass)) {
      errors.push(
        'Class must be mechanical, product-contract, or implementation.',
      );
    }
    if (!['yes', 'no'].includes(contractChanged)) {
      errors.push('Product contract changed must be yes or no.');
    }
    if (
      boundaryValues.length === 0 ||
      boundaryValues.some(
        (boundary) => boundary !== 'none' && !highRiskBoundaries.has(boundary),
      ) ||
      (boundaryValues.includes('none') && boundaryValues.length > 1)
    ) {
      errors.push(
        'High-risk boundaries must be none or a comma-separated canonical boundary list.',
      );
    }
    if (
      !['exempt-low-risk', 'required'].includes(preflight) &&
      !/^linked\s+\S+$/u.test(preflight)
    ) {
      errors.push(
        'Preflight must be exempt-low-risk, required, or linked <repository-path>.',
      );
    }
    if (specReview !== undefined && specReview !== 'approved') {
      errors.push('Pre-code Spec review must be approved when provided.');
    }

    const hasHighRiskBoundary =
      boundaryValues.length > 0 && !boundaryValues.includes('none');
    const hasFullPreflight =
      preflight === 'required' || preflight.startsWith('linked ');

    if (
      classification['High-risk boundaries'] !== null &&
      boundaryValues.includes('none')
    ) {
      errors.push('Remove High-risk boundaries when none apply.');
    }

    if (preflight === 'exempt-low-risk' && !isConcrete(exemptionReason ?? '')) {
      errors.push('A low-risk exemption requires a concrete Exemption reason.');
    }
    if (hasFullPreflight && exemptionReason !== null) {
      errors.push('Remove Exemption reason when a full preflight is used.');
    }
    if (contractChanged === 'yes' && !isConcrete(normativeOwner ?? '')) {
      errors.push('A product contract change requires a normative owner.');
    }
    if (contractChanged === 'yes' && specReview !== 'approved') {
      errors.push(
        'A product contract change requires an approved pre-code Spec review.',
      );
    }
    if (contractChanged !== 'yes' && normativeOwner !== null) {
      errors.push(
        'Remove Normative owner when the product contract did not change.',
      );
    }
    if (
      !hasFullPreflight &&
      contractChanged !== 'yes' &&
      specReview !== undefined
    ) {
      errors.push('Remove Pre-code Spec review when it is not required.');
    }
    if (changeClass === 'mechanical') {
      if (contractChanged !== 'no') {
        errors.push('A mechanical change cannot change the product contract.');
      }
      if (hasHighRiskBoundary || preflight !== 'exempt-low-risk') {
        errors.push(
          'A mechanical change must use no high-risk boundaries and exempt-low-risk.',
        );
      }
    }
    if (changeClass === 'product-contract') {
      if (contractChanged !== 'yes') {
        errors.push(
          'A product-contract change must set Product contract changed to yes.',
        );
      }
    }
    if (hasHighRiskBoundary && !hasFullPreflight) {
      errors.push(
        'High-risk boundaries require a preflight marked required or linked.',
      );
    }
    if (hasFullPreflight && specReview !== 'approved') {
      errors.push(
        'A full preflight requires an approved pre-code Spec review.',
      );
    }
  }

  if (closingIssueNumber(visibleBody) === null) {
    errors.push('Add an issue-closing line in the form: Closes #24');
  }

  if (/^Closes\s+#\s*$/im.test(visibleBody)) {
    errors.push('Replace the empty Closes # placeholder with an issue number.');
  }

  const retrospective =
    visibleBody.split('## Agent environment retrospective')[1] ?? '';
  const noFriction =
    /none observed/i.test(retrospective) ||
    /^\|\s*None\s*\|\s*No avoidable environment or repository friction observed\.\s*\|/imu.test(
      retrospective,
    );
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

export async function validatePullRequestGovernance({
  body,
  issueBody,
  issueIsPullRequest = false,
  repositoryRoot,
  issueSource = 'originating issue',
}) {
  const errors = validatePullRequestBody(body);
  if (issueIsPullRequest) {
    errors.push('Closes #N must reference a GitHub issue, not a pull request.');
  }
  const classification = getPullRequestClassification(body);
  if (!classification) return errors;

  const issueDisposition = getComplexFeaturePreflightDisposition(
    issueBody ?? '',
  );
  const declaredDisposition = normalizePreflightDisposition(
    classification.Preflight,
  );
  const contractChanged =
    classification['Product contract changed'].toLowerCase() === 'yes';
  const hasFullPreflight =
    declaredDisposition === 'required' ||
    declaredDisposition.startsWith('linked ');
  const preflightErrors = await validateComplexFeaturePreflightContents(
    issueBody ?? '',
    {
      repositoryRoot,
      source: issueSource,
      requireApprovedSpecReview: contractChanged || hasFullPreflight,
    },
  );
  errors.push(...preflightErrors);

  if (
    issueDisposition &&
    normalizePreflightDisposition(issueDisposition) !== declaredDisposition
  ) {
    errors.push(
      `PR declares ${declaredDisposition} but issue declares ${issueDisposition}.`,
    );
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
