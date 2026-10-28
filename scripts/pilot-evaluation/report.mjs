export const limitation =
  'Timings, references and hashes are supplied declarations. This command performs no independent measurement, source-byte authenticity check or semantic-support verification.';

function literal(value) {
  return (
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/[\\`*_[\]{}()#!|+~]/g, '\\$&')
      // Entity encoding also prevents GFM's bare URL/email autolinks.
      .replace(/[.:@]/g, (character) => `&#${character.codePointAt(0)};`)
  );
}

function metadata(value, prefix = '') {
  return Object.entries(value).flatMap(([key, item]) => {
    const label = prefix ? `${prefix}.${key}` : key;
    return item !== null && typeof item === 'object'
      ? metadata(item, label)
      : [
          `${literal(label)}: ${item === null ? 'unavailable (not declared)' : literal(item)}.`,
          '',
        ];
  });
}

function rate(value) {
  return `${value.numerator}/${value.denominator} = ${value.value ?? 'unavailable (zero denominator)'}`;
}

function metricLines(name, value) {
  const reasons = value.exclusions?.length ? value.exclusions.join(', ') : null;
  if (reasons) return [`${name}: unavailable (${reasons}).`, ''];
  if (name === 'Time')
    return [
      `Time: ${value.manualMs} → ${value.assistedMs} ms; reduction ${value.reductionPercent === null ? 'unavailable (no positive paired times)' : `${value.reductionPercent}%`}.`,
      '',
    ];
  const delta = (v) =>
    v === null ? 'unavailable (zero denominator)' : `${v} percentage points`;
  if (name !== 'Citations')
    return [
      `${name}: manual ${rate(value.manual)}; assisted ${rate(value.assisted)}; assisted minus manual ${delta(value.assistedMinusManualPp)}.`,
      '',
    ];
  const exact = (v) => (typeof v === 'boolean' ? String(v) : rate(v));
  return [
    `Citations: manual precision ${rate(value.manual.precision)}, recall ${rate(value.manual.recall)}, exact ${exact(value.manual.exact)}; assisted precision ${rate(value.assisted.precision)}, recall ${rate(value.assisted.recall)}, exact ${exact(value.assisted.exact)}.`,
    '',
    `Citation differences: precision ${delta(value.precisionDeltaPp)}; recall ${delta(value.recallDeltaPp)}; exact ${'exactDelta' in value ? `${value.exactDelta} case indicator` : delta(value.exactDeltaPp)}.`,
    '',
  ];
}

function sideLines(name, value) {
  if (value === null)
    return [`${name}: unavailable (missing observation).`, ''];
  const lines = [
    `${name}: status ${value.status}; elapsed ${value.elapsedMs === null ? 'unavailable (unmeasured time)' : `${value.elapsedMs} ms`}; identity mismatches ${value.identityMismatches.length ? value.identityMismatches.join(', ') : 'none'}.`,
    '',
    ...metadata(value.declaredIdentity, `${name}.declaredIdentity`),
  ];
  const fields = value.fields;
  if (fields === null)
    lines.push(
      `${name} fields: unavailable (uncaptured, incomplete task or incompatible identity).`,
      '',
    );
  else {
    lines.push(
      `${name} fields: initial ${fields.initialCorrectCount}/${fields.expectedCount}${fields.expectedCount === 0 ? ' (unavailable: no reference fields)' : ''}; review coverage ${fields.reviewedCount}/${fields.expectedCount}${fields.expectedCount === 0 ? ' (unavailable: no reference fields)' : ''}; final correctness ${fields.finalCorrectCount}/${fields.reviewedCount}${fields.reviewedCount === 0 ? ' (unavailable: zero denominator)' : ''}; changed ${fields.changedCount}/${fields.reviewedCount}${fields.reviewedCount === 0 ? ' (unavailable: zero denominator)' : ''}.`,
      '',
    );
    for (const d of fields.details)
      lines.push(
        `${name} field ${literal(d.fieldId)}: present ${d.present}; initial matches ${d.initialMatches}; final matches ${d.finalMatches ?? 'unavailable (not reviewed)'}; changed ${d.changed ?? 'unavailable (not reviewed)'}.`,
        '',
      );
  }
  const citations = value.citations;
  if (citations === null)
    lines.push(
      `${name} citations: unavailable (unsupported reference, uncaptured, incomplete task or incompatible identity).`,
      '',
    );
  else {
    for (const [kind, tuples] of Object.entries(citations))
      lines.push(
        `${name} citations ${kind}: ${tuples.length}${tuples.length ? '; ' + tuples.map((c) => `${literal(c.sourceId)} Version ${c.sourceVersion} locator ${literal(c.locator)}`).join('; ') : ''}.`,
        '',
      );
  }
  return lines;
}

export function renderReport(result) {
  const aggregate = result.aggregate;
  const lines = [
    result.caseSet.dataKind === 'synthetic'
      ? '# SYNTHETIC — mechanics demonstration'
      : '# DECLARED ANONYMIZED OBSERVATIONS — not independently verified',
    '',
    limitation,
    '',
    'A complete report or exit 0 is no pilot quality verdict, expert approval, representative real pilot, AI qualification or business acceptance.',
    '',
    ...metadata({
      evaluatorVersion: result.evaluatorVersion,
      evaluationId: result.evaluationId,
      inputs: result.inputs,
      caseSet: result.caseSet,
      runs: result.runs,
    }),
    '## Paired aggregate',
    '',
    `Declared cases: ${aggregate.declaredCasesCount}; base pairs: ${aggregate.basePairCount}.`,
    '',
  ];
  for (const [key, name] of [
    ['time', 'Time'],
    ['fields', 'Fields'],
    ['changes', 'Changes'],
    ['citations', 'Citations'],
  ]) {
    const metric = aggregate[key];
    lines.push(
      `${name} paired cases: ${metric.pairedCaseIds.length}; IDs: ${metric.pairedCaseIds.map(literal).join(', ') || 'none'}.`,
      '',
      ...metricLines(name, metric),
    );
    for (const row of metric.excluded)
      lines.push(
        `${name} excluded case ${literal(row.caseId)}: ${row.reasons.join(', ')}.`,
        '',
      );
  }
  for (const row of result.cases) {
    lines.push(
      `## Case ${literal(row.caseId)}`,
      '',
      ...metadata(row.referenceIdentity, 'referenceIdentity'),
      ...sideLines('Manual', row.manual),
      ...sideLines('Assisted', row.assisted),
    );
    for (const [key, name] of [
      ['time', 'Time'],
      ['fields', 'Fields'],
      ['changes', 'Changes'],
      ['citations', 'Citations'],
    ])
      lines.push(...metricLines(name, row.pairs[key]));
  }
  return lines.join('\n').trimEnd() + '\n';
}
