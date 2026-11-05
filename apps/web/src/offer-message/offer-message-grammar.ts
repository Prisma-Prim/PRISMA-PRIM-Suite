export type OfferMessageFields = {
  recipient: string;
  subject: string;
  body: string;
};
export type OfferMessageField = keyof OfferMessageFields;

function validUnicode(value: string): boolean {
  return !/[\uD800-\uDFFF]/u.test(value);
}
export function validOfferMessageRecipient(value: string): boolean {
  if (value.length < 1 || value.length > 254) return false;
  const parts = value.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || !domain || local.length > 64) return false;
  if (
    !local
      .split('.')
      .every((atom) => /^[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~]+$/u.test(atom))
  )
    return false;
  const labels = domain.split('.');
  return (
    labels.length >= 2 &&
    labels.every(
      (label) =>
        label.length <= 63 &&
        /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/u.test(label),
    )
  );
}
export function validOfferMessageSubject(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= 200 &&
    /\S/u.test(value) &&
    validUnicode(value) &&
    !/[\p{Cc}\u2028\u2029]/u.test(value)
  );
}
export function validOfferMessageBody(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= 10000 &&
    /\S/u.test(value) &&
    validUnicode(value) &&
    ![...value].some(
      (character) =>
        /\p{Cc}/u.test(character) &&
        character !== '\t' &&
        character !== '\r' &&
        character !== '\n',
    )
  );
}
export function validOfferMessageFields(fields: OfferMessageFields): boolean {
  return (
    validOfferMessageRecipient(fields.recipient) &&
    validOfferMessageSubject(fields.subject) &&
    validOfferMessageBody(fields.body)
  );
}
