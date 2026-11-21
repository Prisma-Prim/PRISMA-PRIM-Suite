import type { ApiResult } from '../api/authenticated-api-client';
import type { ScopedOperation } from '../api/use-scoped-operation';
import type { ReactNode } from 'react';
import type { ActorContext } from '../access-types';
import type { certificationAuthority } from './certification-access';
import type {
  CaseDetail,
  CaseTimeline,
  DocumentRegister,
} from './certification-response';
import type { useCertificationCopy } from './certification.copy';
import type { CertificationMessageKey } from './certification.copy';
import type { DecisionPrecondition } from './certification-decision';
import type { ConsistencyRule } from './certification-consistency';

/** One serialized command and its key, retried unchanged when uncertain. */
export type Intent = {
  path: string;
  body: string;
  key: string;
  caseId: string | null;
};
export type Feedback =
  | { status: 'idle' | 'saved' }
  | { status: 'saving' | 'uncertain'; intent: Intent }
  /** `reload`: the shown Case is outdated; saving waits for a reload. */
  | { status: 'refused'; message: CertificationMessageKey; reload: boolean }
  /**
   * The decision's unmet preconditions, as the read Case shows them before
   * sending or as the server listed them when it refused the decision.
   */
  | {
      status: 'unmet';
      source: 'case' | 'server';
      failures: DecisionPrecondition[];
      /** The blocking Discrepancies, from the read Case or as the server named them. */
      discrepancies: NamedDiscrepancy[];
    };
/** A Discrepancy a decision is refused for, by identity and rule. */
export type NamedDiscrepancy = { id: string; rule: ConsistencyRule | 'manual' };
export const IDLE: Feedback = { status: 'idle' };

export function reuse(feedback: Feedback, next: Omit<Intent, 'key'>): Intent {
  return feedback.status === 'uncertain' &&
    feedback.intent.path === next.path &&
    feedback.intent.body === next.body
    ? feedback.intent
    : { ...next, key: crypto.randomUUID() };
}

/** Replays the exact intent retained for an unanswered command. */
export function retryUncertainCommand(
  feedback: Feedback,
  execute: (intent: Intent) => Promise<void>,
): void {
  if (feedback.status === 'uncertain') void execute(feedback.intent);
}

export function blockedUntilReload(feedback: Feedback): boolean {
  return feedback.status === 'refused' && feedback.reload;
}

export function clearReloadedFeedback(feedback: Feedback): Feedback {
  return feedback.status === 'refused' || feedback.status === 'unmet'
    ? IDLE
    : feedback;
}

export function describedFeedbackId(feedback: Feedback, id: string) {
  return feedback.status === 'refused' ||
    feedback.status === 'uncertain' ||
    feedback.status === 'unmet'
    ? id
    : undefined;
}

export function refusedWith(
  message: CertificationMessageKey,
  reload = false,
): Feedback {
  return { status: 'refused', message, reload };
}

export type CertificationCaseView = {
  caseDetail: CaseDetail;
  timeline: CaseTimeline;
  register: DocumentRegister;
};
export type CertificationCommand<Kind extends string> = {
  kind: Kind;
  intent: Intent;
  setFeedback: (next: Feedback) => void;
  confirmed: () => void;
};

export interface CertificationWorkflowContext<Kind extends string> {
  view: CertificationCaseView | undefined;
  actor: ActorContext;
  authority: ReturnType<typeof certificationAuthority>;
  prefix: string;
  copy: ReturnType<typeof useCertificationCopy>;
  commit: (command: CertificationCommand<Kind>) => Promise<void>;
  renderFeedback: (presentation: {
    kind: Kind;
    feedback: Feedback;
    id: string;
    retry: () => void;
  }) => ReactNode;
}

export type CertificationAccess =
  'certification' | 'documents' | 'administration';
export type CertificationQuery = (
  slot: ScopedOperation,
  signal: AbortSignal,
  path: string,
  post?: { body: string; key?: string },
  access?: CertificationAccess,
) => Promise<ApiResult<unknown>>;

export function unexpected(value: never): never {
  throw new Error(`Unexpected Certification state: ${String(value)}`);
}
