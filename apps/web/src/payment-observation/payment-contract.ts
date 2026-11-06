import type {
  PaymentAction,
  PaymentActor,
  PaymentConfirmation,
  PaymentCurrent,
  PaymentFact,
  PaymentHistory,
  PaymentHistoryPage,
  PaymentInventory,
  PaymentLiveSource,
  PaymentClient,
  PaymentReceipt,
  PaymentRevision,
  PaymentSelectable,
  PaymentSource,
  PaymentSourcePage,
  PaymentSummary,
  PaymentValues,
  PaymentCopy,
} from './payment.types';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
function fail(): never {
  throw new Error('Invalid Payment response.');
}
function object(v: unknown, keys: string[]): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fail();
  const r = Object.fromEntries(Object.entries(v));
  if (
    Object.keys(r).length !== keys.length ||
    Object.keys(r).some((k) => !keys.includes(k))
  )
    return fail();
  return r;
}
function text(v: unknown, max?: number): string {
  if (
    typeof v !== 'string' ||
    !v.trim() ||
    /[\uD800-\uDFFF]/u.test(v) ||
    /\p{Cc}/u.test(v) ||
    (max !== undefined && v.length > max)
  )
    return fail();
  return v;
}
function native(v: unknown): string {
  if (
    typeof v !== 'string' ||
    !v.trim() ||
    /[\uD800-\uDFFF]/u.test(v) ||
    v.includes('\0')
  )
    return fail();
  return v;
}
function id(v: unknown): string {
  return typeof v === 'string' && UUID.test(v) ? v : fail();
}
function revision(v: unknown): number {
  return typeof v === 'number' &&
    Number.isSafeInteger(v) &&
    v >= 1 &&
    v <= 2147483647
    ? v
    : fail();
}
function instant(v: unknown): string {
  return typeof v === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString() === v
    ? v
    : fail();
}
function cursor(v: unknown): string | null {
  return v === null
    ? null
    : typeof v === 'string' && v.length > 0 && v.length <= 2048
      ? v
      : fail();
}
function date(v: unknown): string {
  return typeof v === 'string' &&
    /^\d{4}-\d\d-\d\d$/u.test(v) &&
    !v.startsWith('0000') &&
    Number.isFinite(Date.parse(v + 'T00:00:00.000Z')) &&
    new Date(v + 'T00:00:00.000Z').toISOString().slice(0, 10) === v
    ? v
    : fail();
}
export function readPaymentValues(v: unknown): PaymentValues {
  const r = object(v, [
    'amountMinor',
    'currency',
    'effectiveOn',
    'method',
    'externalReference',
    'observationBasis',
  ]);
  if (
    typeof r.amountMinor !== 'string' ||
    !/^[1-9][0-9]{0,13}$/u.test(r.amountMinor) ||
    (r.currency !== 'MDL' &&
      r.currency !== 'EUR' &&
      r.currency !== 'RON' &&
      r.currency !== 'USD')
  )
    return fail();
  return {
    amountMinor: r.amountMinor,
    currency: r.currency,
    effectiveOn: date(r.effectiveOn),
    method: text(r.method, 120),
    externalReference:
      r.externalReference === null ? null : text(r.externalReference, 200),
    observationBasis: text(r.observationBasis, 2000),
  };
}
function actor(v: unknown): PaymentActor {
  const r = object(v, ['membershipId', 'displayName']);
  return {
    membershipId: id(r.membershipId),
    displayName: native(r.displayName),
  };
}
function confirmation(v: unknown): PaymentConfirmation {
  const r = object(v, ['actor', 'recordedAt', 'note']);
  return {
    actor: actor(r.actor),
    recordedAt: instant(r.recordedAt),
    note: text(r.note, 2000),
  };
}
function fact(v: unknown): PaymentFact {
  const r = object(v, ['state', 'values', 'confirmation']),
    values = readPaymentValues(r.values);
  if (r.state === 'DRAFT' || r.state === 'WITHDRAWN') {
    if (r.confirmation !== null) return fail();
    return { state: r.state, values, confirmation: null };
  }
  if (r.state !== 'CONFIRMED' && r.state !== 'REVERSED') return fail();
  return { state: r.state, values, confirmation: confirmation(r.confirmation) };
}
function action(v: unknown): PaymentAction {
  return v === 'CREATE' ||
    v === 'CORRECT_DRAFT' ||
    v === 'WITHDRAW_DRAFT' ||
    v === 'CONFIRM' ||
    v === 'REVERSE'
    ? v
    : fail();
}
function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
export function readPaymentReceipt(v: unknown): PaymentReceipt {
  const r = object(v, [
    'format',
    'commandId',
    'paymentId',
    'revision',
    'action',
    'recordedAt',
  ]);
  if (r.format !== 'PAYMENT_COMMAND/1') return fail();
  return {
    format: r.format,
    commandId: id(r.commandId),
    paymentId: id(r.paymentId),
    revision: revision(r.revision),
    action: action(r.action),
    recordedAt: instant(r.recordedAt),
  };
}
function historyRevision(v: unknown): PaymentRevision {
  const r = object(v, [
    'format',
    'paymentId',
    'revision',
    'action',
    'commandId',
    'actor',
    'recordedAt',
    'before',
    'after',
    'reason',
  ]);
  if (r.format !== 'PAYMENT_REVISION/1') return fail();
  const h: PaymentRevision = {
    format: r.format,
    paymentId: id(r.paymentId),
    revision: revision(r.revision),
    action: action(r.action),
    commandId: id(r.commandId),
    actor: actor(r.actor),
    recordedAt: instant(r.recordedAt),
    before: r.before === null ? null : fact(r.before),
    after: fact(r.after),
    reason: r.reason === null ? null : text(r.reason, 2000),
  };
  const b = h.before,
    a = h.after;
  if (h.action === 'CREATE') {
    if (
      h.revision !== 1 ||
      b !== null ||
      h.reason !== null ||
      a.state !== 'DRAFT'
    )
      return fail();
    return h;
  }
  if (!b || h.revision < 2) return fail();
  switch (h.action) {
    case 'CORRECT_DRAFT':
      if (
        b.state !== 'DRAFT' ||
        a.state !== 'DRAFT' ||
        h.reason === null ||
        equal(b.values, a.values)
      )
        return fail();
      break;
    case 'WITHDRAW_DRAFT':
      if (
        b.state !== 'DRAFT' ||
        a.state !== 'WITHDRAWN' ||
        h.reason === null ||
        !equal(b.values, a.values)
      )
        return fail();
      break;
    case 'CONFIRM':
      if (
        b.state !== 'DRAFT' ||
        a.state !== 'CONFIRMED' ||
        h.reason !== null ||
        !equal(b.values, a.values) ||
        !equal(a.confirmation.actor, h.actor) ||
        a.confirmation.recordedAt !== h.recordedAt
      )
        return fail();
      break;
    case 'REVERSE':
      if (
        b.state !== 'CONFIRMED' ||
        a.state !== 'REVERSED' ||
        h.reason === null ||
        !equal(b.values, a.values) ||
        !equal(b.confirmation, a.confirmation)
      )
        return fail();
      break;
    default: {
      const exhaustive: never = h.action;
      return exhaustive;
    }
  }
  return h;
}
function copy(v: unknown): PaymentCopy {
  const r = object(v, ['companyLabel', 'payer']),
    p = object(r.payer, ['kind', 'legalName', 'taxId', 'legalAddress']);
  if (p.kind !== 'PRIMARY' && p.kind !== 'ADDITIONAL') return fail();
  return {
    companyLabel: native(r.companyLabel),
    payer: {
      kind: p.kind,
      legalName: native(p.legalName),
      taxId: p.taxId === null ? null : native(p.taxId),
      legalAddress: p.legalAddress === null ? null : native(p.legalAddress),
    },
  };
}
function summary(v: unknown): PaymentSummary {
  const r = object(v, [
    'id',
    'revision',
    'state',
    'values',
    'confirmation',
    'copiedContext',
    'createdAt',
    'replacesClosedPaymentId',
    'replacementPaymentId',
  ]);
  const result = {
    id: id(r.id),
    revision: revision(r.revision),
    ...fact({ state: r.state, values: r.values, confirmation: r.confirmation }),
    copiedContext: copy(r.copiedContext),
    createdAt: instant(r.createdAt),
    replacesClosedPaymentId:
      r.replacesClosedPaymentId === null ? null : id(r.replacesClosedPaymentId),
    replacementPaymentId:
      r.replacementPaymentId === null ? null : id(r.replacementPaymentId),
  };
  if (
    result.id === result.replacesClosedPaymentId ||
    result.id === result.replacementPaymentId
  )
    return fail();
  return result;
}
function tuple(v: unknown): PaymentSource {
  const r = object(v, ['documentId', 'documentVersionId', 'representationId']);
  return {
    documentId: id(r.documentId),
    documentVersionId: id(r.documentVersionId),
    representationId: id(r.representationId),
  };
}
function bytes(v: unknown) {
  const r = object(v, ['fileName', 'byteLength', 'sha256']);
  if (
    typeof r.byteLength !== 'number' ||
    !Number.isInteger(r.byteLength) ||
    r.byteLength < 1 ||
    r.byteLength > 5242880 ||
    typeof r.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(r.sha256)
  )
    return fail();
  return {
    fileName: text(r.fileName, 120),
    byteLength: r.byteLength,
    sha256: r.sha256,
  };
}
function source(v: unknown): PaymentSelectable {
  const r = object(v, [
    'source',
    'documentTitle',
    'versionNumber',
    'versionState',
    'fileName',
    'byteLength',
    'sha256',
    'copiedContext',
  ]);
  if (r.versionState !== 'official' && r.versionState !== 'superseded')
    return fail();
  return {
    source: tuple(r.source),
    documentTitle: native(r.documentTitle),
    versionNumber: revision(r.versionNumber),
    versionState: r.versionState,
    ...bytes({
      fileName: r.fileName,
      byteLength: r.byteLength,
      sha256: r.sha256,
    }),
    copiedContext: copy(r.copiedContext),
  };
}
function live(v: unknown): PaymentLiveSource {
  if (v && typeof v === 'object' && 'kind' in v && v.kind === 'UNAVAILABLE') {
    object(v, ['kind']);
    return { kind: 'UNAVAILABLE' };
  }
  const r = object(v, [
    'kind',
    'documentId',
    'documentVersionId',
    'title',
    'versionNumber',
    'versionState',
    'content',
  ]);
  if (
    r.kind !== 'AVAILABLE' ||
    (r.versionState !== 'official' && r.versionState !== 'superseded')
  )
    return fail();
  const raw = r.content;
  if (
    raw &&
    typeof raw === 'object' &&
    'kind' in raw &&
    raw.kind === 'UNAVAILABLE'
  ) {
    object(raw, ['kind']);
    return {
      kind: 'AVAILABLE',
      documentId: id(r.documentId),
      documentVersionId: id(r.documentVersionId),
      title: native(r.title),
      versionNumber: revision(r.versionNumber),
      versionState: r.versionState,
      content: { kind: 'UNAVAILABLE' },
    };
  }
  const c = object(raw, [
    'kind',
    'representationId',
    'fileName',
    'byteLength',
    'sha256',
  ]);
  if (c.kind !== 'AVAILABLE') return fail();
  return {
    kind: 'AVAILABLE',
    documentId: id(r.documentId),
    documentVersionId: id(r.documentVersionId),
    title: native(r.title),
    versionNumber: revision(r.versionNumber),
    versionState: r.versionState,
    content: {
      kind: 'AVAILABLE',
      representationId: id(c.representationId),
      ...bytes({
        fileName: c.fileName,
        byteLength: c.byteLength,
        sha256: c.sha256,
      }),
    },
  };
}
function client(v: unknown): PaymentClient {
  if (v && typeof v === 'object' && 'kind' in v && v.kind === 'UNAVAILABLE') {
    object(v, ['kind']);
    return { kind: 'UNAVAILABLE' };
  }
  const r = object(v, ['kind', 'clientId', 'displayName']);
  if (r.kind !== 'AVAILABLE') return fail();
  return {
    kind: 'AVAILABLE',
    clientId: id(r.clientId),
    displayName: native(r.displayName),
  };
}
function page(
  v: unknown,
  paymentId: string,
  head: number,
  before = head + 1,
): PaymentHistoryPage {
  const r = object(v, ['items', 'nextCursor']);
  if (!Array.isArray(r.items) || r.items.length < 1 || r.items.length > 25)
    return fail();
  const items = r.items.map(historyRevision),
    nextCursor = cursor(r.nextCursor);
  for (let n = 0; n < items.length; n++) {
    const h = items[n],
      newer = items[n - 1];
    if (
      !h ||
      h.paymentId !== paymentId ||
      h.revision !== before - n - 1 ||
      (newer && !equal(newer.before, h.after))
    )
      return fail();
  }
  if (
    (nextCursor === null && items.at(-1)?.revision !== 1) ||
    (nextCursor !== null &&
      (items.length !== 25 || items.at(-1)?.revision === 1))
  )
    return fail();
  return { items, nextCursor };
}
export function readPaymentInventory(
  v: unknown,
  companyId: string,
  capture: string,
): PaymentInventory {
  const r = object(v, [
    'format',
    'companyId',
    'readCapture',
    'items',
    'nextCursor',
  ]);
  if (
    r.format !== 'PAYMENT_INVENTORY/1' ||
    r.companyId !== companyId ||
    r.readCapture !== capture ||
    !Array.isArray(r.items) ||
    r.items.length > 25
  )
    return fail();
  const items = r.items.map(summary),
    nextCursor = cursor(r.nextCursor);
  if (nextCursor !== null && items.length !== 25) return fail();
  const seen = new Set<string>();
  for (let n = 0; n < items.length; n++) {
    const x = items[n],
      prev = items[n - 1];
    if (
      !x ||
      seen.has(x.id) ||
      (prev &&
        (prev.createdAt < x.createdAt ||
          (prev.createdAt === x.createdAt && prev.id <= x.id)))
    )
      return fail();
    seen.add(x.id);
  }
  return {
    format: r.format,
    companyId,
    readCapture: capture,
    items,
    nextCursor,
  };
}
export function readPaymentCurrent(
  v: unknown,
  companyId: string,
  capture: string,
  paymentId: string,
): PaymentCurrent {
  const r = object(v, [
    'format',
    'companyId',
    'readCapture',
    'payment',
    'actor',
    'recordedAt',
    'capabilities',
    'liveSource',
    'client',
    'history',
  ]);
  if (
    r.format !== 'PAYMENT_OBSERVATION/1' ||
    r.companyId !== companyId ||
    r.readCapture !== capture
  )
    return fail();
  const payment = summary(r.payment);
  if (payment.id !== paymentId) return fail();
  const caps = object(r.capabilities, [
    'canCorrect',
    'canWithdraw',
    'canConfirm',
    'canReverse',
    'canReplace',
  ]);
  for (const x of Object.values(caps))
    if (typeof x !== 'boolean') return fail();
  if (
    typeof caps.canCorrect !== 'boolean' ||
    typeof caps.canWithdraw !== 'boolean' ||
    typeof caps.canConfirm !== 'boolean' ||
    typeof caps.canReverse !== 'boolean' ||
    typeof caps.canReplace !== 'boolean'
  )
    return fail();
  if (
    (payment.state !== 'DRAFT' &&
      (caps.canCorrect || caps.canWithdraw || caps.canConfirm)) ||
    (payment.state !== 'CONFIRMED' && caps.canReverse) ||
    (!['WITHDRAWN', 'REVERSED'].includes(payment.state) && caps.canReplace)
  )
    return fail();
  const history = page(r.history, paymentId, payment.revision),
    head = history.items[0],
    a = actor(r.actor),
    recordedAt = instant(r.recordedAt);
  if (
    !head ||
    !equal(head.after, {
      state: payment.state,
      values: payment.values,
      confirmation: payment.confirmation,
    }) ||
    !equal(head.actor, a) ||
    head.recordedAt !== recordedAt
  )
    return fail();
  return {
    format: r.format,
    companyId,
    readCapture: capture,
    payment,
    actor: a,
    recordedAt,
    capabilities: {
      canCorrect: caps.canCorrect,
      canWithdraw: caps.canWithdraw,
      canConfirm: caps.canConfirm,
      canReverse: caps.canReverse,
      canReplace: caps.canReplace,
    },
    liveSource: live(r.liveSource),
    client: client(r.client),
    history,
  };
}
export function readPaymentHistory(
  v: unknown,
  companyId: string,
  capture: string,
  paymentId: string,
  head: number,
  before: number,
): PaymentHistory {
  const r = object(v, [
    'format',
    'companyId',
    'readCapture',
    'paymentId',
    'headRevision',
    'items',
    'nextCursor',
  ]);
  if (
    r.format !== 'PAYMENT_HISTORY/1' ||
    r.companyId !== companyId ||
    r.readCapture !== capture ||
    r.paymentId !== paymentId ||
    r.headRevision !== head
  )
    return fail();
  return {
    format: r.format,
    companyId,
    readCapture: capture,
    paymentId,
    headRevision: head,
    ...page(
      { items: r.items, nextCursor: r.nextCursor },
      paymentId,
      head,
      before,
    ),
  };
}
export function readPaymentSources(
  v: unknown,
  companyId: string,
  capture: string,
): PaymentSourcePage {
  const r = object(v, [
    'format',
    'companyId',
    'readCapture',
    'items',
    'nextCursor',
  ]);
  if (
    r.format !== 'PAYMENT_SOURCE_PAGE/1' ||
    r.companyId !== companyId ||
    r.readCapture !== capture ||
    !Array.isArray(r.items) ||
    r.items.length > 25
  )
    return fail();
  const items = r.items.map(source),
    nextCursor = cursor(r.nextCursor);
  if (nextCursor !== null && items.length !== 25) return fail();
  let previous: string | undefined;
  for (const item of items) {
    const order = [
      item.source.documentId,
      item.source.documentVersionId,
      item.source.representationId,
    ].join(':');
    if (previous !== undefined && order <= previous) return fail();
    previous = order;
  }
  return {
    format: r.format,
    companyId,
    readCapture: capture,
    items,
    nextCursor,
  };
}
