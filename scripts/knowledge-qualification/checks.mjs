import { fail } from '../pilot-evaluation/diagnostic.mjs';

export function requireValue(condition, input, path, code = 'E_SCHEMA') {
  if (!condition)
    fail(code, input, path, 'Use the documented closed contract.');
}
export function keys(value, required, optional, input, path) {
  requireValue(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    input,
    path,
  );
  requireValue(
    required.every((key) => Object.hasOwn(value, key)) &&
      Object.keys(value).every(
        (key) => required.includes(key) || optional.includes(key),
      ),
    input,
    path,
  );
}
export function list(value, max, input, path, minimum = 0) {
  requireValue(
    Array.isArray(value) && value.length >= minimum && value.length <= max,
    input,
    path,
  );
}
export function text(value, max, input, path) {
  const characters = typeof value === 'string' ? Array.from(value) : [];
  requireValue(
    typeof value === 'string' &&
      value.isWellFormed() &&
      characters.length >= 1 &&
      characters.length <= max &&
      characters.every((character) => {
        const point = character.codePointAt(0);
        return (
          (point >= 32 || point === 9 || point === 10 || point === 13) &&
          point !== 127
        );
      }),
    input,
    path,
  );
}
export function id(value, input, path) {
  requireValue(
    typeof value === 'string' && /^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(value),
    input,
    path,
  );
}
export function version(value, input, path) {
  requireValue(
    Number.isInteger(value) && value >= 1 && value <= 1000000,
    input,
    path,
  );
}
export function oneOf(value, values, input, path) {
  requireValue(values.includes(value), input, path);
}
export const refKey = (value) => `${value.sourceId}\u0000${value.version}`;
export const citationKey = (value) =>
  JSON.stringify([value.sourceId, value.version, value.locator, value.quote]);
export function unique(values, key, input, path) {
  requireValue(
    new Set(values.map(key)).size === values.length,
    input,
    path,
    'E_DUPLICATE',
  );
}
export function refs(value, input, path, max = 16) {
  list(value, max, input, path);
  value.forEach((ref, index) => {
    const at = `${path}/${index}`;
    keys(ref, ['sourceId', 'version'], [], input, at);
    id(ref.sourceId, input, at + '/sourceId');
    version(ref.version, input, at + '/version');
  });
  unique(value, refKey, input, path);
}
export function citations(value, input, path) {
  list(value, 32, input, path);
  value.forEach((citation, index) => {
    const at = `${path}/${index}`;
    keys(citation, ['sourceId', 'version', 'locator', 'quote'], [], input, at);
    id(citation.sourceId, input, at + '/sourceId');
    version(citation.version, input, at + '/version');
    text(citation.locator, 256, input, at + '/locator');
    text(citation.quote, 16000, input, at + '/quote');
  });
  unique(
    value,
    (citation) =>
      JSON.stringify([citation.sourceId, citation.version, citation.locator]),
    input,
    path,
  );
}
export function fields(value, input, path) {
  list(value, 32, input, path);
  value.forEach((field, index) => {
    const at = `${path}/${index}`;
    keys(
      field,
      ['fieldId', 'state', 'value'],
      ['rationale', 'alternatives'],
      input,
      at,
    );
    id(field.fieldId, input, at + '/fieldId');
    oneOf(
      field.state,
      ['confirmed', 'inferred', 'missing', 'contradictory'],
      input,
      at + '/state',
    );
    if (['confirmed', 'inferred'].includes(field.state))
      text(field.value, 1000, input, at + '/value');
    else requireValue(field.value === null, input, at + '/value');
    if (Object.hasOwn(field, 'rationale'))
      text(field.rationale, 2000, input, at + '/rationale');
    if (Object.hasOwn(field, 'alternatives')) {
      requireValue(
        field.state === 'contradictory',
        input,
        at + '/alternatives',
      );
      list(field.alternatives, 16, input, at + '/alternatives', 2);
      field.alternatives.forEach((item, n) =>
        text(item, 1000, input, `${at}/alternatives/${n}`),
      );
      unique(field.alternatives, (item) => item, input, at + '/alternatives');
    }
  });
  unique(value, (item) => item.fieldId, input, path);
}
export const outcomes = [
  'supported',
  'supported_history',
  'contradictory',
  'insufficient_evidence',
  'insufficient_authorized_evidence',
  'access_denied',
  'supported_with_untrusted_instruction',
  'analysis_proposal',
  'human_accepted',
  'human_corrected',
  'human_rejected',
  'insufficient_admitted_evidence',
];
