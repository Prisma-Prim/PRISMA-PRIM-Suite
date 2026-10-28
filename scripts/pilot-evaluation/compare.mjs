const identityKeys = [
  'caseVersion',
  'sourceSetId',
  'sourceSetVersion',
  'referenceId',
  'referenceVersion',
];

const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const byId = (a, b) => order(a.fieldId, b.fieldId);
const sameValue = (a, b) => a.state === b.state && a.value === b.value;
const tupleKey = (c) =>
  JSON.stringify([c.sourceId, c.sourceVersion, c.locator]);

function codePointOrder(a, b) {
  const left = Array.from(a, (c) => c.codePointAt(0));
  const right = Array.from(b, (c) => c.codePointAt(0));
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] !== right[i]) return order(left[i], right[i]);
  }
  return order(left.length, right.length);
}

function citationOrder(a, b) {
  return (
    order(a.sourceId, b.sourceId) ||
    order(a.sourceVersion, b.sourceVersion) ||
    codePointOrder(a.locator, b.locator)
  );
}

function decimal(numerator, denominator) {
  if (denominator === 0n) return null;
  const negative = numerator < 0n;
  const magnitude = (negative ? -numerator : numerator) * 1000000n;
  const rounded =
    magnitude / denominator +
    ((magnitude % denominator) * 2n >= denominator ? 1n : 0n);
  const digits = rounded.toString().padStart(7, '0');
  return `${negative && rounded !== 0n ? '-' : ''}${digits.slice(0, -6)}.${digits.slice(-6)}`;
}

function rate(numerator, denominator) {
  return {
    numerator,
    denominator,
    value: decimal(BigInt(numerator), BigInt(denominator)),
  };
}

function delta(manual, assisted) {
  if (manual.denominator === 0 || assisted.denominator === 0) return null;
  return decimal(
    100n *
      (BigInt(assisted.numerator) * BigInt(manual.denominator) -
        BigInt(manual.numerator) * BigInt(assisted.denominator)),
    BigInt(manual.denominator) * BigInt(assisted.denominator),
  );
}

function reduction(manual, assisted) {
  return decimal(100n * BigInt(manual - assisted), BigInt(manual));
}

function identity(value) {
  return Object.fromEntries(identityKeys.map((key) => [key, value[key]]));
}

function referenceIdentity(c) {
  return identity({ ...c, ...c.reference });
}

function fields(reference, observed) {
  const values = new Map(observed.map((field) => [field.fieldId, field]));
  const details = [...reference].sort(byId).map((expected) => {
    const actual = values.get(expected.fieldId);
    return {
      fieldId: expected.fieldId,
      present: actual !== undefined,
      initialMatches: actual ? sameValue(expected, actual.initial) : false,
      finalMatches: actual?.final ? sameValue(expected, actual.final) : null,
      changed: actual?.final ? !sameValue(actual.initial, actual.final) : null,
    };
  });
  return {
    expectedCount: reference.length,
    initialCorrectCount: details.filter((d) => d.initialMatches).length,
    reviewedCount: details.filter((d) => d.finalMatches !== null).length,
    finalCorrectCount: details.filter((d) => d.finalMatches === true).length,
    changedCount: details.filter((d) => d.changed === true).length,
    details,
  };
}

function citations(c, observed) {
  const expected = [...c.reference.citations].sort(citationOrder);
  const sorted = [...observed].sort(citationOrder);
  const expectedKeys = new Set(expected.map(tupleKey));
  const observedKeys = new Set(sorted.map(tupleKey));
  const inventory = new Set(
    c.sources.flatMap((s) =>
      s.locators.map((locator) =>
        tupleKey({
          sourceId: s.sourceId,
          sourceVersion: s.sourceVersion,
          locator,
        }),
      ),
    ),
  );
  return {
    expected,
    observed: sorted,
    matched: expected.filter((x) => observedKeys.has(tupleKey(x))),
    missing: expected.filter((x) => !observedKeys.has(tupleKey(x))),
    unexpected: sorted.filter((x) => !expectedKeys.has(tupleKey(x))),
    unresolved: sorted.filter((x) => !inventory.has(tupleKey(x))),
  };
}

function side(c, observation) {
  if (!observation) return null;
  const expected = referenceIdentity(c);
  const identityMismatches = identityKeys.filter(
    (key) => observation[key] !== expected[key],
  );
  const eligible =
    observation.status === 'completed' && identityMismatches.length === 0;
  return {
    declaredIdentity: identity(observation),
    status: observation.status,
    elapsedMs: observation.elapsedMs,
    identityMismatches,
    fields:
      eligible && observation.fields !== null
        ? fields(c.reference.fields, observation.fields)
        : null,
    citations:
      eligible &&
      c.reference.citations !== null &&
      observation.citations !== null
        ? citations(c, observation.citations)
        : null,
  };
}

function baseExclusions(manual, assisted) {
  const sides = { manual, assisted };
  return ['missing', 'incompatible', 'failed', 'not_run'].flatMap((reason) =>
    ['manual', 'assisted'].flatMap((name) => {
      const value = sides[name];
      const excluded =
        reason === 'missing'
          ? value === null
          : reason === 'incompatible'
            ? value !== null && value.identityMismatches.length > 0
            : value?.status === reason;
      return excluded ? [`${reason}_${name}`] : [];
    }),
  );
}

function citationRates(value) {
  return {
    precision: rate(value.matched.length, value.observed.length),
    recall: rate(value.matched.length, value.expected.length),
    exact: value.missing.length === 0 && value.unexpected.length === 0,
  };
}

function pairs(c, manual, assisted) {
  const base = baseExclusions(manual, assisted);
  const time = [...base];
  const field = [
    ...base,
    ...(c.reference.fields.length === 0 ? ['no_reference_fields'] : []),
  ];
  const change = [...field];
  const citation = [
    ...base,
    ...(c.reference.citations === null
      ? ['unsupported_reference_citations']
      : []),
  ];
  if (base.length === 0) {
    for (const [code, predicate] of [
      ['unmeasured_time', (s) => s.elapsedMs === null],
      ['zero_time', (s) => s.elapsedMs === 0],
    ]) {
      for (const [name, value] of Object.entries({ manual, assisted })) {
        if (predicate(value)) time.push(`${code}_${name}`);
      }
    }
    for (const [name, value] of Object.entries({ manual, assisted })) {
      if (value.fields === null) {
        field.push(`unmeasured_fields_${name}`);
        change.push(`unmeasured_fields_${name}`);
      }
    }
    for (const [name, value] of Object.entries({ manual, assisted })) {
      if (
        value.fields !== null &&
        value.fields.reviewedCount < c.reference.fields.length
      )
        change.push(`incomplete_review_${name}`);
    }
    // Unsupported reference citations and uncaptured observations are independent.
    for (const [name, observation] of [
      ['manual', manual],
      ['assisted', assisted],
    ]) {
      if (observation.observedCitationsNull)
        citation.push(`unmeasured_citations_${name}`);
    }
  }
  const fieldPair = (exclusions, count) => ({
    exclusions,
    manual: exclusions.length
      ? null
      : rate(manual.fields[count], c.reference.fields.length),
    assisted: exclusions.length
      ? null
      : rate(assisted.fields[count], c.reference.fields.length),
    assistedMinusManualPp: exclusions.length
      ? null
      : delta(
          rate(manual.fields[count], c.reference.fields.length),
          rate(assisted.fields[count], c.reference.fields.length),
        ),
  });
  const m = citation.length ? null : citationRates(manual.citations);
  const a = citation.length ? null : citationRates(assisted.citations);
  return {
    time: {
      exclusions: time,
      manualMs: time.length ? null : manual.elapsedMs,
      assistedMs: time.length ? null : assisted.elapsedMs,
      reductionPercent: time.length
        ? null
        : reduction(manual.elapsedMs, assisted.elapsedMs),
    },
    fields: fieldPair(field, 'initialCorrectCount'),
    changes: fieldPair(change, 'changedCount'),
    citations: {
      exclusions: citation,
      manual: m,
      assisted: a,
      precisionDeltaPp: m ? delta(m.precision, a.precision) : null,
      recallDeltaPp: m ? delta(m.recall, a.recall) : null,
      exactDelta: m ? Number(a.exact) - Number(m.exact) : null,
    },
  };
}

function aggregate(rows) {
  const partition = (name) => ({
    pairedCaseIds: rows
      .filter((r) => r.pairs[name].exclusions.length === 0)
      .map((r) => r.caseId),
    excluded: rows
      .filter((r) => r.pairs[name].exclusions.length > 0)
      .map((r) => ({ caseId: r.caseId, reasons: r.pairs[name].exclusions })),
  });
  const sum = (name, select) =>
    rows.reduce(
      (n, r) =>
        n + (r.pairs[name].exclusions.length ? 0 : select(r.pairs[name])),
      0,
    );
  const sumRate = (name, sideName, metric) =>
    rate(
      sum(name, (p) =>
        metric ? p[sideName][metric].numerator : p[sideName].numerator,
      ),
      sum(name, (p) =>
        metric ? p[sideName][metric].denominator : p[sideName].denominator,
      ),
    );
  const manualMs = sum('time', (p) => p.manualMs);
  const assistedMs = sum('time', (p) => p.assistedMs);
  const fieldAggregate = (name) => {
    const manual = sumRate(name, 'manual');
    const assisted = sumRate(name, 'assisted');
    return {
      ...partition(name),
      manual,
      assisted,
      assistedMinusManualPp: delta(manual, assisted),
    };
  };
  const citationSide = (name) => ({
    precision: sumRate('citations', name, 'precision'),
    recall: sumRate('citations', name, 'recall'),
    exact: rate(
      sum('citations', (p) => Number(p[name].exact)),
      partition('citations').pairedCaseIds.length,
    ),
  });
  const manual = citationSide('manual');
  const assisted = citationSide('assisted');
  return {
    declaredCasesCount: rows.length,
    basePairCount: rows.filter(
      (r) => baseExclusions(r.manual, r.assisted).length === 0,
    ).length,
    time: {
      ...partition('time'),
      manualMs,
      assistedMs,
      reductionPercent: reduction(manualMs, assistedMs),
    },
    fields: fieldAggregate('fields'),
    changes: fieldAggregate('changes'),
    citations: {
      ...partition('citations'),
      manual,
      assisted,
      precisionDeltaPp: delta(manual.precision, assisted.precision),
      recallDeltaPp: delta(manual.recall, assisted.recall),
      exactDeltaPp: delta(manual.exact, assisted.exact),
    },
  };
}

export function compare(caseFile, runFile, hashes) {
  const observationMap = (run) =>
    new Map(run.observations.map((o) => [o.caseId, o]));
  const manual = observationMap(runFile.manual);
  const assisted = observationMap(runFile.assisted);
  const rows = [...caseFile.cases]
    .sort((a, b) => order(a.caseId, b.caseId))
    .map((c) => {
      const m = side(c, manual.get(c.caseId));
      const a = side(c, assisted.get(c.caseId));
      const pairSide = (s, observation) =>
        s && { ...s, observedCitationsNull: observation.citations === null };
      return {
        caseId: c.caseId,
        referenceIdentity: referenceIdentity(c),
        manual: m,
        assisted: a,
        pairs: pairs(
          c,
          pairSide(m, manual.get(c.caseId)),
          pairSide(a, assisted.get(c.caseId)),
        ),
      };
    });
  const metadata = (run) =>
    Object.fromEntries(
      Object.entries(run).filter(([key]) => key !== 'observations'),
    );
  return {
    schema: 'prisma-prim-pilot-result/v1',
    evaluatorVersion: '1.0.0',
    evaluationId: runFile.evaluationId,
    inputs: hashes,
    caseSet: {
      caseSetId: caseFile.caseSetId,
      caseSetVersion: caseFile.caseSetVersion,
      dataKind: caseFile.dataKind,
      scope: caseFile.scope,
      protocol: caseFile.protocol,
    },
    runs: {
      manual: metadata(runFile.manual),
      assisted: metadata(runFile.assisted),
    },
    cases: rows,
    aggregate: aggregate(rows),
  };
}
