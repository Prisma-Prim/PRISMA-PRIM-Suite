import {
  exchangePage,
  exchangePosition,
} from './certification-exchange-page.js';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, eq } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import { commandFingerprint } from '../command/idempotent-command.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  certificationDiscrepancyResolutions,
  certificationExchangeRecords,
  certificationReverificationItems,
  certificationReverificationWithdrawals,
  certificationManualDiscrepancies,
} from '../database/schema/certification.js';
import {
  CONSISTENCY_RULE_SET_VERSION,
  consistencySection,
} from './certification-consistency.js';
import {
  manualDiscrepancyCommand,
  resolutionCommand,
} from './certification-consistency.validation.js';
import {
  currentExchanges,
  type ExchangeRecordVersion,
} from './certification-exchanges.js';
import {
  exchangeCommand,
  reverificationCommand,
  withdrawalCommand,
  type ExchangeValue,
} from './certification-exchanges.validation.js';
import { type StoredReverificationItem } from './certification-reverification.js';
import { latestBusinessDate } from './certification-attribution.js';
import { DOCUMENT_ROLES } from './certification.validation.js';
import { CertificationCaseTransactions } from './certification-case-transactions.js';
import { CertificationCaseReadModel } from './certification-case-read-model.js';
import {
  stepConflict,
  unchangedCorrection,
  sameValue,
} from './certification-case-versions.js';
import type {
  CaseCommandInput,
  CaseRow,
  StepRow,
} from './certification-case-versions.js';

/** Owns dossier discrepancies, exchanges and items to reverify. */
@Injectable()
export class CertificationDossierService {
  constructor(
    private readonly database: DatabaseContext,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
    private readonly transactions: CertificationCaseTransactions,
    private readonly repository: CertificationCaseReadModel,
  ) {}

  /** A bounded continuation of a Case register, at the initial read's revision. */
  exchanges({
    actor,
    caseId,
    query,
  }: {
    actor: ActorContext;
    caseId: string;
    query: unknown;
  }) {
    const targetId = requireUuid(caseId);
    return this.transactions.read(actor, 'reader', async (companyId) => {
      const row = await this.repository.visibleCase(
        actor,
        companyId,
        targetId,
        {
          lock: 'share',
        },
      );
      return exchangePage({
        caseId: targetId,
        revision: row.revision,
        versions: await this.repository.exchangeVersions(
          actor,
          companyId,
          targetId,
        ),
        position: exchangePosition(query),
      });
    });
  }

  /** A programme manager, an auditor on the team or an approver outside it records a manual Discrepancy. */
  recordDiscrepancy({
    actor,
    caseId,
    body,
    key,
  }: CaseCommandInput): Promise<unknown> {
    const idempotencyKey = requireIdempotencyKey(key);
    const targetId = requireUuid(caseId);
    return this.transactions.command({
      actor,
      role: 'contributor',
      kind: 'discrepancy',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, body }),
      execute: async (companyId) => {
        const input = manualDiscrepancyCommand(body);
        const current = await this.repository.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
        );
        const steps = await this.repository.steps(actor, companyId, targetId);
        await this.requireContributor(actor, steps, 'discrepancy');
        for (const side of [input.left, input.right])
          await this.repository.requireAttachment(
            actor,
            companyId,
            targetId,
            side.attachmentId,
            DOCUMENT_ROLES,
          );
        const [recorded] = await this.database.connection
          .select({ value: count() })
          .from(certificationManualDiscrepancies)
          .where(
            and(
              eq(
                certificationManualDiscrepancies.workspaceId,
                actor.workspaceId,
              ),
              eq(certificationManualDiscrepancies.companyId, companyId),
              eq(certificationManualDiscrepancies.caseId, targetId),
            ),
          );
        const now = this.clock.now();
        await this.database.connection
          .insert(certificationManualDiscrepancies)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            caseId: targetId,
            caseRevision: current.revision + 1,
            sequence: (recorded?.value ?? 0) + 1,
            verdict: input.verdict,
            subject: input.subject,
            leftValue: input.left.value,
            leftAttachmentId: input.left.attachmentId,
            leftLocation: input.left.location,
            rightValue: input.right.value,
            rightAttachmentId: input.right.attachmentId,
            rightLocation: input.right.location,
            note: input.note,
            actorMembershipId: actor.workspaceMembershipId,
            actorInternalUserId: actor.internalUserId,
            actorDisplayName: actor.displayName,
            recordedAt: now,
          });
        return this.transactions.advance({
          actor,
          companyId,
          current,
          at: now,
          action: 'certification_case.discrepancy_recorded',
          metadata: { verdict: input.verdict },
        });
      },
    });
  }

  /**
   * Accepts an open Discrepancy with a reason, or closes a manual one as
   * corrected. "To clarify": a programme manager or an approver outside the
   * team; "error": only such an approver; critical: never, only a correction.
   */
  resolveDiscrepancy({
    actor,
    caseId,
    body,
    key,
  }: CaseCommandInput): Promise<unknown> {
    const idempotencyKey = requireIdempotencyKey(key);
    const targetId = requireUuid(caseId);
    return this.transactions.command({
      actor,
      role: 'contributor',
      kind: 'discrepancy_resolution',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, body }),
      execute: async (companyId) => {
        const input = resolutionCommand(body);
        // Resolutions remain possible on a refused or certified Case.
        const current = await this.repository.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
          ['open', 'refused', 'certified'],
        );
        const steps = await this.repository.steps(actor, companyId, targetId);
        const findings = await this.repository.findings(
          actor,
          companyId,
          targetId,
          steps,
        );
        const section = consistencySection(
          await this.repository.consistencyInput(
            actor,
            companyId,
            current,
            steps,
            findings,
          ),
        );
        const target = section.open.find(
          (view) => view.id === input.discrepancyId,
        );
        if (!target)
          throw stepConflict(
            'CERTIFICATION_DISCREPANCY_NOT_OPEN',
            'This Discrepancy is not open on the current Case; reload it.',
          );
        const roles = await this.transactions.contributorRoles(actor);
        const onTeam = this.transactions.onTeam(actor, steps);
        const approver = roles.has('approver') && !onTeam;
        const manager = roles.has('programme_manager');
        const refuse = () =>
          roles.has('approver') && onTeam
            ? stepConflict(
                'CERTIFICATION_INDEPENDENCE',
                'A member of the audit team cannot resolve this Discrepancy.',
              )
            : new ForbiddenException();
        let correctedByAttachmentId: string | null = null;
        let correctedByStepVersionId: string | null = null;
        if (input.resolution === 'accepted') {
          if (target.verdict === 'critical')
            throw stepConflict(
              'CERTIFICATION_DISCREPANCY_CRITICAL',
              'A critical Discrepancy is resolved only by correcting the records.',
            );
          if (target.verdict === 'error' ? !approver : !approver && !manager)
            throw refuse();
        } else {
          if (target.origin !== 'manual')
            throw stepConflict(
              'CERTIFICATION_DISCREPANCY_CORRECTED_BY_RECORD',
              'A rule Discrepancy closes when a new record version makes its values agree.',
            );
          if (!approver && !manager) throw refuse();
          const reference = input.correctedBy;
          if (reference.kind === 'attachment') {
            await this.repository.requireAttachment(
              actor,
              companyId,
              targetId,
              reference.attachmentId,
              DOCUMENT_ROLES,
            );
            correctedByAttachmentId = reference.attachmentId;
          } else {
            if (!steps.some((step) => step.id === reference.versionId))
              throw stepConflict(
                'CERTIFICATION_CORRECTING_RECORD_UNKNOWN',
                'Name a record version of this Case as the correction.',
              );
            correctedByStepVersionId = reference.versionId;
          }
        }
        const rule = target.origin === 'rule' ? target.rule : 'manual';
        const now = this.clock.now();
        await this.database.connection
          .insert(certificationDiscrepancyResolutions)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            caseId: targetId,
            caseRevision: current.revision + 1,
            discrepancyId: target.id,
            ruleCode: rule,
            manualDiscrepancyId:
              target.origin === 'manual'
                ? target.id.slice('manual:'.length)
                : null,
            kind: input.resolution,
            verdict: target.verdict,
            reason: input.reason,
            comparedValues: {
              subject: target.subject,
              left: target.left.value,
              right: target.right.value,
            },
            correctedByAttachmentId,
            correctedByStepVersionId,
            ruleSetVersion: CONSISTENCY_RULE_SET_VERSION,
            actorMembershipId: actor.workspaceMembershipId,
            actorInternalUserId: actor.internalUserId,
            actorDisplayName: actor.displayName,
            recordedAt: now,
          });
        // The acceptance's re-verification flag adds a linked item.
        if (input.reverify)
          await this.insertReverificationItem(actor, companyId, current, {
            origin: 'discrepancy',
            text: input.reason,
            source: { kind: 'discrepancy', discrepancyId: target.id },
            at: now,
          });
        return this.transactions.advance({
          actor,
          companyId,
          current,
          at: now,
          action: 'certification_case.discrepancy_resolved',
          metadata: {
            rule,
            verdict: target.verdict,
            resolution: input.resolution,
            ...(input.reverify ? { reverification: 'added' } : {}),
          },
        });
      },
    });
  }

  /**
   * A programme manager records an Exchange Record, or corrects one with a
   * reason, on an open, refused or certified Case. The business date is not
   * later than today anywhere (UTC+14); each exchanged Version is attached
   * to this Case.
   */
  recordExchange({
    actor,
    caseId,
    sequence,
    body,
    key,
  }: CaseCommandInput & { sequence?: string }): Promise<unknown> {
    const idempotencyKey = requireIdempotencyKey(key);
    const targetId = requireUuid(caseId);
    const correcting =
      sequence === undefined ? null : exchangeSequence(sequence);
    return this.transactions.command({
      actor,
      kind: 'exchange',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, sequence: correcting, body }),
      execute: async (companyId) => {
        const input = exchangeCommand(body);
        const current = await this.repository.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
          ['open', 'refused', 'certified'],
        );
        const recorded = currentExchanges(
          await this.repository.exchangeVersions(actor, companyId, targetId),
        );
        let number: number;
        let version: number;
        if (correcting === null) {
          if (input.reason !== null)
            throw stepConflict(
              'CERTIFICATION_CORRECTION_REASON',
              'A correction states its reason; a first Exchange Record has none.',
            );
          number = Math.max(0, ...recorded.map((entry) => entry.sequence)) + 1;
          version = 1;
        } else {
          const previous = recorded.find(
            (entry) => entry.sequence === correcting,
          );
          if (!previous) throw new NotFoundException();
          if (input.reason === null)
            throw stepConflict(
              'CERTIFICATION_CORRECTION_REASON',
              'A correction states its reason; a first Exchange Record has none.',
            );
          if (sameExchange(previous, input.value)) throw unchangedCorrection();
          number = correcting;
          version = previous.version + 1;
        }
        await this.repository.requireAttachments(
          actor,
          companyId,
          targetId,
          input.value.attachmentIds,
        );
        if (input.value.businessDate > latestBusinessDate(this.clock.now()))
          throw stepConflict(
            'CERTIFICATION_EXCHANGE_IN_FUTURE',
            'An exchange cannot be dated after today.',
          );
        const now = this.clock.now();
        await this.database.connection
          .insert(certificationExchangeRecords)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            caseId: targetId,
            sequence: number,
            version,
            caseRevision: current.revision + 1,
            direction: input.value.direction,
            itemKind: input.value.itemKind,
            counterpartKind: input.value.counterpart.kind,
            counterpartName: input.value.counterpart.name,
            businessDate: input.value.businessDate,
            channel: input.value.channel,
            reference: input.value.reference,
            note: input.value.note,
            attachmentIds: input.value.attachmentIds,
            reason: input.reason,
            actorMembershipId: actor.workspaceMembershipId,
            actorInternalUserId: actor.internalUserId,
            actorDisplayName: actor.displayName,
            recordedAt: now,
          });
        return this.transactions.advance({
          actor,
          companyId,
          current,
          at: now,
          action: 'certification_case.exchange_recorded',
          metadata: {
            sequence: number,
            version,
            direction: input.value.direction,
            itemKind: input.value.itemKind,
            channel: input.value.channel,
            counterpartKind: input.value.counterpart.kind,
          },
        });
      },
    });
  }

  /**
   * A programme manager, an auditor on the team or an approver outside it
   * adds a manual Re-verification Item, with an optional source of this Case.
   */
  addReverificationItem({
    actor,
    caseId,
    body,
    key,
  }: CaseCommandInput): Promise<unknown> {
    const idempotencyKey = requireIdempotencyKey(key);
    const targetId = requireUuid(caseId);
    return this.transactions.command({
      actor,
      role: 'contributor',
      kind: 'reverification_item',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, body }),
      execute: async (companyId) => {
        const input = reverificationCommand(body);
        const current = await this.repository.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
          ['open', 'refused', 'certified'],
        );
        const steps = await this.repository.steps(actor, companyId, targetId);
        await this.requireContributor(actor, steps, 'reverification');
        const source = input.source;
        if (source?.kind === 'attachment')
          await this.repository.requireAttachment(
            actor,
            companyId,
            targetId,
            source.attachmentId,
            DOCUMENT_ROLES,
          );
        else if (source?.kind === 'finding') {
          const findings = await this.repository.findings(
            actor,
            companyId,
            targetId,
            steps,
          );
          if (!findings.some((finding) => finding.id === source.findingId))
            throw unknownSource();
        } else if (source?.kind === 'exchange') {
          const recorded = await this.repository.exchangeVersions(
            actor,
            companyId,
            targetId,
          );
          if (!recorded.some((entry) => entry.sequence === source.sequence))
            throw unknownSource();
        } else if (source?.kind === 'discrepancy') {
          const section = consistencySection(
            await this.repository.consistencyInput(
              actor,
              companyId,
              current,
              steps,
              await this.repository.findings(actor, companyId, targetId, steps),
            ),
          );
          if (
            ![...section.open, ...section.resolved].some(
              (view) => view.id === source.discrepancyId,
            )
          )
            throw unknownSource();
        }
        const now = this.clock.now();
        await this.insertReverificationItem(actor, companyId, current, {
          origin: 'manual',
          text: input.text,
          source,
          at: now,
        });
        return this.transactions.advance({
          actor,
          companyId,
          current,
          at: now,
          action: 'certification_case.reverification_item_added',
          metadata: { origin: 'manual', source: source?.kind ?? 'none' },
        });
      },
    });
  }

  /** A programme manager withdraws a manual Re-verification Item with a reason. */
  withdrawReverificationItem({
    actor,
    caseId,
    itemId,
    body,
    key,
  }: CaseCommandInput & { itemId: string }): Promise<unknown> {
    const idempotencyKey = requireIdempotencyKey(key);
    const targetId = requireUuid(caseId);
    // An automatic item is derived from its Finding: it has no stored
    // identity to withdraw, so its `finding:` id finds nothing here.
    const target = itemId.startsWith('finding:') ? null : requireUuid(itemId);
    return this.transactions.command({
      actor,
      kind: 'reverification_withdrawal',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, itemId, body }),
      execute: async (companyId) => {
        const input = withdrawalCommand(body);
        const current = await this.repository.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
          ['open', 'refused', 'certified'],
        );
        if (target === null)
          throw stepConflict(
            'CERTIFICATION_REVERIFICATION_AUTOMATIC',
            'An automatic Re-verification Item cannot be withdrawn.',
          );
        const [item] = await this.database.connection
          .select({ id: certificationReverificationItems.id })
          .from(certificationReverificationItems)
          .where(
            and(
              eq(
                certificationReverificationItems.workspaceId,
                actor.workspaceId,
              ),
              eq(certificationReverificationItems.companyId, companyId),
              eq(certificationReverificationItems.caseId, targetId),
              eq(certificationReverificationItems.id, target),
            ),
          );
        if (!item) throw new NotFoundException();
        const [withdrawn] = await this.database.connection
          .select({ id: certificationReverificationWithdrawals.id })
          .from(certificationReverificationWithdrawals)
          .where(
            and(
              eq(
                certificationReverificationWithdrawals.workspaceId,
                actor.workspaceId,
              ),
              eq(certificationReverificationWithdrawals.companyId, companyId),
              eq(certificationReverificationWithdrawals.caseId, targetId),
              eq(certificationReverificationWithdrawals.itemId, target),
            ),
          );
        if (withdrawn)
          throw stepConflict(
            'CERTIFICATION_REVERIFICATION_WITHDRAWN',
            'This Re-verification Item is already withdrawn.',
          );
        const now = this.clock.now();
        await this.database.connection
          .insert(certificationReverificationWithdrawals)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            caseId: targetId,
            caseRevision: current.revision + 1,
            itemId: target,
            reason: input.reason,
            actorMembershipId: actor.workspaceMembershipId,
            actorInternalUserId: actor.internalUserId,
            actorDisplayName: actor.displayName,
            recordedAt: now,
          });
        return this.transactions.advance({
          actor,
          companyId,
          current,
          at: now,
          action: 'certification_case.reverification_item_withdrawn',
          metadata: { origin: 'manual' },
        });
      },
    });
  }

  /** Inserts a stored Re-verification Item at the next Case revision. */
  private async insertReverificationItem(
    actor: ActorContext,
    companyId: string,
    current: CaseRow,
    item: {
      origin: 'manual' | 'discrepancy';
      text: string;
      source: StoredReverificationItem['source'];
      at: Date;
    },
  ): Promise<void> {
    const [recorded] = await this.database.connection
      .select({ value: count() })
      .from(certificationReverificationItems)
      .where(
        and(
          eq(certificationReverificationItems.workspaceId, actor.workspaceId),
          eq(certificationReverificationItems.companyId, companyId),
          eq(certificationReverificationItems.caseId, current.id),
        ),
      );
    const source = item.source;
    await this.database.connection
      .insert(certificationReverificationItems)
      .values({
        workspaceId: actor.workspaceId,
        companyId,
        caseId: current.id,
        caseRevision: current.revision + 1,
        sequence: (recorded?.value ?? 0) + 1,
        origin: item.origin,
        text: item.text,
        sourceKind: source?.kind ?? null,
        sourceFindingId: source?.kind === 'finding' ? source.findingId : null,
        sourceDiscrepancyId:
          source?.kind === 'discrepancy' ? source.discrepancyId : null,
        sourceExchangeSequence:
          source?.kind === 'exchange' ? source.sequence : null,
        sourceAttachmentId:
          source?.kind === 'attachment' ? source.attachmentId : null,
        actorMembershipId: actor.workspaceMembershipId,
        actorInternalUserId: actor.internalUserId,
        actorDisplayName: actor.displayName,
        recordedAt: item.at,
      });
  }

  /**
   * Refuses unless the actor is a programme manager, an auditor on the
   * audit team or an approver outside it, rechecked in the transaction.
   */
  private async requireContributor(
    actor: ActorContext,
    steps: readonly StepRow[],
    act: 'discrepancy' | 'reverification',
  ): Promise<void> {
    const roles = await this.transactions.contributorRoles(actor);
    const onTeam = this.transactions.onTeam(actor, steps);
    if (
      roles.has('programme_manager') ||
      (roles.has('auditor') && onTeam) ||
      (roles.has('approver') && !onTeam)
    )
      return;
    const what =
      act === 'discrepancy' ? 'a Discrepancy' : 'a Re-verification Item';
    throw roles.has('approver')
      ? stepConflict(
          'CERTIFICATION_INDEPENDENCE',
          `A member of the audit team records ${what} as its auditor, not as an approver.`,
        )
      : stepConflict(
          'CERTIFICATION_NOT_ON_TEAM',
          `An auditor records ${what} on the Cases whose audit team includes them.`,
        );
  }
}

function exchangeSequence(value: string): number {
  if (!/^[1-9]\d{0,8}$/u.test(value)) throw new NotFoundException();
  return Number(value);
}

/** Whether a correction would restate the current version unchanged. */
function sameExchange(
  previous: ExchangeRecordVersion,
  value: ExchangeValue,
): boolean {
  return sameValue(
    {
      direction: previous.direction,
      itemKind: previous.itemKind,
      attachmentIds: previous.attachmentIds,
      counterpart: previous.counterpart,
      businessDate: previous.businessDate,
      channel: previous.channel,
      reference: previous.reference,
      note: previous.note,
    },
    value,
  );
}

function unknownSource(): ConflictException {
  return stepConflict(
    'CERTIFICATION_REVERIFICATION_SOURCE_UNKNOWN',
    'Name a Finding, Discrepancy, Exchange Record or attached Document Version of this Case.',
  );
}
