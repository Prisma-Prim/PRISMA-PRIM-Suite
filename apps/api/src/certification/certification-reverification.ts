import type { FindingView } from './certification-findings.js';
import type {
  CertificationActorReference,
  CertificationAttachment,
} from './certification.types.js';

/**
 * What to verify at the next Audit of the same Client Legal Entity (dossier
 * control PRD §9.6). Each minor nonconformity whose plan was judged
 * adequate adds an automatic item, derived on read; members add manual
 * items, and an acceptance with the re-verification flag adds one. Items
 * stay open until the deferred surveillance contract closes them.
 */
export type ReverificationSource =
  | { kind: 'finding'; findingId: string; sequence: number }
  | { kind: 'discrepancy'; discrepancyId: string }
  | { kind: 'exchange'; sequence: number }
  | {
      kind: 'attachment';
      attachmentId: string;
      sourceTitle: string;
      versionNumber: number;
    };

/** A stored item, as its table records it. */
export interface StoredReverificationItem {
  id: string;
  sequence: number;
  caseRevision: number;
  origin: 'manual' | 'discrepancy';
  text: string;
  source:
    | { kind: 'finding'; findingId: string }
    | { kind: 'discrepancy'; discrepancyId: string }
    | { kind: 'exchange'; sequence: number }
    | { kind: 'attachment'; attachmentId: string }
    | null;
  addedBy: CertificationActorReference;
  addedAt: string;
}

export interface ReverificationWithdrawal {
  itemId: string;
  caseRevision: number;
  reason: string;
  by: CertificationActorReference;
  at: string;
}

type ItemBase = {
  id: string;
  caseRevision: number;
  source: ReverificationSource | null;
};
export type ReverificationItemView =
  | (ItemBase & {
      origin: 'automatic';
      sequence: null;
      text: null;
      addedBy: null;
      addedAt: null;
      status: 'open';
      withdrawal: null;
    })
  | (ItemBase & {
      origin: 'manual' | 'discrepancy';
      sequence: number;
      text: string;
      addedBy: CertificationActorReference;
      addedAt: string;
    } & (
        | { status: 'open'; withdrawal: null }
        | {
            status: 'withdrawn';
            withdrawal: Omit<ReverificationWithdrawal, 'itemId'>;
          }
      ));

export interface ReverificationSection {
  items: ReverificationItemView[];
  /** The latest start of the first surveillance, once the Certificate exists. */
  firstSurveillanceBy: string | null;
}

/** The identity of the automatic item a Finding adds. */
export function automaticItemId(findingId: string): string {
  return `finding:${findingId}`;
}

/** The automatic, then the stored items of one Case, with their state. */
export function reverificationSection(input: {
  findings: readonly FindingView[];
  stored: readonly StoredReverificationItem[];
  withdrawals: readonly ReverificationWithdrawal[];
  attachments: readonly CertificationAttachment[];
  firstSurveillanceBy: string | null;
}): ReverificationSection {
  const items: ReverificationItemView[] = [];
  for (const finding of input.findings) {
    if (finding.classification !== 'minor_nonconformity') continue;
    let judged: number | null = null;
    for (const record of finding.records)
      if (record.kind === 'plan_judgment')
        judged =
          record.value.outcome === 'adequate' ? record.caseRevision : null;
    if (judged === null) continue;
    items.push({
      id: automaticItemId(finding.id),
      origin: 'automatic',
      sequence: null,
      text: null,
      caseRevision: judged,
      source: {
        kind: 'finding',
        findingId: finding.id,
        sequence: finding.sequence,
      },
      addedBy: null,
      addedAt: null,
      status: 'open',
      withdrawal: null,
    });
  }
  for (const item of [...input.stored].sort(
    (left, right) => left.sequence - right.sequence,
  )) {
    const withdrawn = input.withdrawals.find(
      (entry) => entry.itemId === item.id,
    );
    const base = {
      id: item.id,
      origin: item.origin,
      sequence: item.sequence,
      text: item.text,
      caseRevision: item.caseRevision,
      source: storedSource(item.source, input),
      addedBy: item.addedBy,
      addedAt: item.addedAt,
    };
    items.push(
      withdrawn
        ? {
            ...base,
            status: 'withdrawn',
            withdrawal: {
              caseRevision: withdrawn.caseRevision,
              reason: withdrawn.reason,
              by: withdrawn.by,
              at: withdrawn.at,
            },
          }
        : { ...base, status: 'open', withdrawal: null },
    );
  }
  return { items, firstSurveillanceBy: input.firstSurveillanceBy };
}

function storedSource(
  source: StoredReverificationItem['source'],
  input: {
    findings: readonly FindingView[];
    attachments: readonly CertificationAttachment[];
  },
): ReverificationSource | null {
  if (source === null) return null;
  switch (source.kind) {
    case 'finding': {
      const finding = input.findings.find(
        (entry) => entry.id === source.findingId,
      );
      return finding
        ? { kind: 'finding', findingId: finding.id, sequence: finding.sequence }
        : null;
    }
    case 'attachment': {
      const attachment = input.attachments.find(
        (entry) => entry.id === source.attachmentId,
      );
      return attachment
        ? {
            kind: 'attachment',
            attachmentId: attachment.id,
            sourceTitle: attachment.sourceTitle,
            versionNumber: attachment.versionNumber,
          }
        : null;
    }
    case 'discrepancy':
    case 'exchange':
      return source;
  }
  return unexpected(source);
}

function unexpected(value: never): never {
  throw new Error(`Unexpected Re-verification source ${String(value)}`);
}
