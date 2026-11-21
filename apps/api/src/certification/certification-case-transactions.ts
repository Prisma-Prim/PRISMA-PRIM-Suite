import { approvalNeedsRenewal } from './certification-release.js';
import type { CompanyPermission } from '../access/captured-company-permissions.js';
import {
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import type { CertificationRole } from '../access/certification-captured-grants.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import {
  commandFingerprint,
  idempotencyConflict,
  runIdempotentCommand,
} from '../command/idempotent-command.js';
import { DatabaseContext } from '../database/database-context.js';
import { readConsistently } from '../database/consistent-read.js';
import {
  certificationNumberObservations,
  certificationCases,
  certificationReceipts,
  certificationStepVersions,
  type CERTIFICATION_COMMAND_KINDS,
} from '../database/schema/certification.js';
import {
  latestBusinessDate,
  sameName,
  type ActAttribution,
} from './certification-attribution.js';
import { teamMembershipIds } from './certification-team.js';
import { findingCommand } from './certification-findings.js';
import type { ApplicationFacts } from './certification.types.js';
import { CertificationCaseReadModel } from './certification-case-read-model.js';
import {
  latest,
  stepConflict,
  certificateDraftApprovalVersion,
  clientOpinionVersion,
  teamVersion,
  unchangedCorrection,
  certificateDraftVersion,
  approvedTeam,
  reviewVersion,
  applicationVersion,
  stepVersion,
  sameValue,
} from './certification-case-versions.js';
import type {
  CaseCommandInput,
  StepRow,
  CaseRow,
} from './certification-case-versions.js';

const CERTIFICATION_REQUIRED_PERMISSION = {
  reader: 'certification.read',
  programme_manager: 'certification.programme.manage',
  approver: 'certification.approve',
  auditor: 'certification.audit.record',
} satisfies Record<CertificationRole, CompanyPermission>;

type CommandKind = (typeof CERTIFICATION_COMMAND_KINDS)[number];

/** Owns Case authorization, transaction boundaries, exact command replay and versioned writes. */
@Injectable()
export class CertificationCaseTransactions {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly accountability: AccountabilityService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
    private readonly repository: CertificationCaseReadModel,
  ) {}

  /** Shared shape of a versioned step command: parse, check, append. */
  versionedStep<T extends object>(
    input: CaseCommandInput & {
      role: Exclude<CertificationRole, 'reader'>;
      kind: CommandKind;
      step: StepRow['step'];
      parse: (value: unknown) => T;
      action: Parameters<
        AccountabilityService['recordCertificationEvent']
      >[0]['action'];
      check: (context: {
        steps: StepRow[];
        companyId: string;
        payload: T;
        current: CaseRow;
      }) => Promise<Record<string, string | number>>;
      status?: (payload: T) => CaseRow['status'] | undefined;
      statuses?: readonly CaseRow['status'][];
    },
  ): Promise<unknown> {
    const idempotencyKey = requireIdempotencyKey(input.key);
    const targetId = requireUuid(input.caseId);
    return this.command({
      actor: input.actor,
      role: input.role,
      kind: input.kind,
      key: idempotencyKey,
      fingerprint: commandFingerprint({
        caseId: input.caseId,
        body: input.body,
      }),
      execute: async (companyId) => {
        const command = findingCommand(input.body, input.parse);
        const current = await this.repository.lockOpenCase(
          input.actor,
          companyId,
          targetId,
          command.expectedRevision,
          input.statuses,
        );
        const steps = await this.repository.steps(
          input.actor,
          companyId,
          targetId,
        );
        const metadata = await input.check({
          steps,
          companyId,
          payload: command.payload,
          current,
        });
        const previous = latest(steps, input.step);
        const version = (previous?.version ?? 0) + 1;
        if ((version === 1) !== (command.reason === null))
          throw stepConflict(
            'CERTIFICATION_CORRECTION_REASON',
            'A new version states its reason; a first record has none.',
          );
        // The draft is approved again after a corrected opinion. This is a
        // new context, so truthful same-day confirmations may stay identical.
        // Every other unchanged correction, including a still-valid approval,
        // keeps the ordinary no-op guard.
        const opinion = latest(steps, 'client_opinion');
        const renewApproval =
          input.step === 'certificate_draft_approval' &&
          previous !== undefined &&
          approvalNeedsRenewal({
            approval: certificateDraftApprovalVersion(previous),
            opinion: opinion ? clientOpinionVersion(opinion) : undefined,
          });
        const status = input.status?.(command.payload);
        return this.appendStep({
          actor: input.actor,
          companyId,
          current,
          step: input.step,
          version,
          ...(renewApproval ? {} : { replaces: previous }),
          payload: command.payload,
          reason: command.reason,
          action: input.action,
          metadata: { version, ...metadata },
          ...(status ? { status } : {}),
        });
      },
    });
  }

  /** Refuses a person named like a member of any team version. */
  requireNotNamedOnTeam(
    steps: readonly StepRow[],
    name: string | undefined,
  ): void {
    if (
      name !== undefined &&
      steps
        .filter((row) => row.step === 'team')
        .some((row) =>
          teamVersion(row).value.members.some((member) =>
            sameName(member.name, name),
          ),
        )
    )
      throw stepConflict(
        'CERTIFICATION_INDEPENDENCE',
        'A member of the audit team cannot perform this act.',
      );
  }

  /**
   * An act on behalf of the certification body is not dated after the latest
   * calendar date already reached, and its signed form belongs to the Case.
   */
  async requireAct(
    actor: ActorContext,
    companyId: string,
    caseId: string,
    act: ActAttribution | null,
  ): Promise<void> {
    if (act && act.actedOn > latestBusinessDate(this.clock.now()))
      throw stepConflict(
        'CERTIFICATION_ACT_IN_FUTURE',
        'An act on behalf of the certification body cannot be dated after today.',
      );
    if (act?.formAttachmentId)
      await this.repository.requireAttachments(actor, companyId, caseId, [
        act.formAttachmentId,
      ]);
  }

  /** Refuses an actor linked to any member of any team version. */
  requireIndependent(actor: ActorContext, steps: readonly StepRow[]) {
    if (this.onTeam(actor, steps))
      throw stepConflict(
        'CERTIFICATION_INDEPENDENCE',
        'A member of the audit team cannot review, decide or issue.',
      );
  }

  /** One keyed mutation: live authority, key lock, replay, then execution. */
  command({
    actor,
    kind,
    key,
    fingerprint,
    execute,
    role = 'programme_manager',
  }: {
    actor: ActorContext;
    /** `contributor`: any mutating bundle; the command then checks which. */
    role?: Exclude<CertificationRole, 'reader'> | 'contributor';
    kind: CommandKind;
    key: string;
    fingerprint: string;
    execute: (companyId: string) => Promise<{ caseId: string; at: Date }>;
  }): Promise<unknown> {
    return this.protect(() =>
      runIdempotentCommand(this.database, {
        fingerprint,
        authorize: async () => {
          if (role !== 'contributor') return this.authorize(actor, role);
          const companyId = await this.authorize(actor, 'reader');
          if ((await this.contributorRoles(actor)).size === 0)
            throw new ForbiddenException();
          return companyId;
        },
        lockParts: (companyId) => [
          'certification',
          actor.workspaceId,
          companyId,
          actor.workspaceMembershipId,
          kind,
          key,
        ],
        findReceipt: (companyId) => this.receipt(actor, companyId, kind, key),
        conflict: () => idempotencyConflict(),
        // An exact retry answers the recorded response, never a newer state.
        replay: (_companyId, receipt) => Promise.resolve(receipt.response),
        execute: async (companyId) => {
          const { caseId, at } = await execute(companyId);
          const response = await this.repository.present(
            actor,
            companyId,
            caseId,
          );
          await this.database.connection.insert(certificationReceipts).values({
            workspaceId: actor.workspaceId,
            companyId,
            actorMembershipId: actor.workspaceMembershipId,
            commandKind: kind,
            idempotencyKey: key,
            fingerprint,
            caseId,
            response,
            recordedAt: at,
          });
          return response;
        },
      }),
    );
  }

  async appendStep(input: {
    actor: ActorContext;
    companyId: string;
    current: CaseRow;
    step: StepRow['step'];
    version: number;
    /** The version this one corrects; an identical value is refused. */
    replaces?: StepRow;
    payload: object;
    reason: string | null;
    action: Parameters<
      AccountabilityService['recordCertificationEvent']
    >[0]['action'];
    metadata: Record<string, string | number>;
    status?: CaseRow['status'];
  }): Promise<{ caseId: string; at: Date }> {
    const { actor, companyId, current } = input;
    if (input.replaces && sameStepValue(input.replaces, input.payload))
      throw unchangedCorrection();
    const now = this.clock.now();
    const revision = current.revision + 1;
    await this.database.connection.insert(certificationStepVersions).values({
      workspaceId: actor.workspaceId,
      companyId,
      caseId: current.id,
      step: input.step,
      version: input.version,
      caseRevision: revision,
      payload: input.payload,
      reason: input.reason,
      actorMembershipId: actor.workspaceMembershipId,
      actorInternalUserId: actor.internalUserId,
      actorDisplayName: actor.displayName,
      recordedAt: now,
    });
    return this.advance({
      actor,
      companyId,
      current,
      at: now,
      action: input.action,
      metadata: input.metadata,
      ...(input.status ? { status: input.status } : {}),
    });
  }

  /** Moves the Case head one revision and records its event, in the command's transaction. */
  async advance(input: {
    actor: ActorContext;
    companyId: string;
    current: CaseRow;
    at: Date;
    action: Parameters<
      AccountabilityService['recordCertificationEvent']
    >[0]['action'];
    metadata: Record<string, string | number>;
    status?: CaseRow['status'];
  }): Promise<{ caseId: string; at: Date }> {
    const { actor, companyId, current, at: now } = input;
    const revision = current.revision + 1;
    const [updated] = await this.database.connection
      .update(certificationCases)
      .set({ revision, status: input.status ?? current.status })
      .where(
        and(
          eq(certificationCases.workspaceId, actor.workspaceId),
          eq(certificationCases.companyId, companyId),
          eq(certificationCases.id, current.id),
          eq(certificationCases.revision, current.revision),
        ),
      )
      .returning({ id: certificationCases.id });
    if (!updated) throw new InternalServerErrorException();
    await this.observeCertificateNumbers(
      actor,
      companyId,
      current.id,
      revision,
      now,
    );
    await this.accountability.recordCertificationEvent({
      actor,
      companyId,
      caseId: current.id,
      revision,
      occurredAt: now,
      action: input.action,
      metadata: { revision, ...input.metadata },
    });
    return { caseId: current.id, at: now };
  }

  /** Snapshot only source presence for this Case's own numbers, in its command transaction. */
  private async observeCertificateNumbers(
    actor: ActorContext,
    companyId: string,
    caseId: string,
    caseRevision: number,
    at: Date,
  ): Promise<void> {
    const drafts = (await this.repository.steps(actor, companyId, caseId))
      .filter((step) => step.step === 'certificate_draft')
      .map(certificateDraftVersion);
    if (drafts.length === 0) return;
    const ownNumbers = new Set(drafts.map((draft) => draft.value.number));
    const issued = await this.repository.issuedCompanyNumbers(
      actor,
      companyId,
      caseId,
    );
    await this.database.connection
      .insert(certificationNumberObservations)
      .values({
        workspaceId: actor.workspaceId,
        companyId,
        caseId,
        caseRevision,
        numbers: issued
          .filter((item) => ownNumbers.has(item.number))
          .map((item) => item.number)
          .sort(),
        recordedAt: at,
      });
  }

  /**
   * The mutating certification bundles the actor holds, rechecked live
   * inside the command's transaction.
   */
  async contributorRoles(
    actor: ActorContext,
  ): Promise<Set<Exclude<CertificationRole, 'reader'>>> {
    const roles = new Set<Exclude<CertificationRole, 'reader'>>();
    for (const role of ['programme_manager', 'approver', 'auditor'] as const)
      if (
        await this.authorization.hasPermissions(actor, {
          permissions: [CERTIFICATION_REQUIRED_PERMISSION[role]],
          prerequisites: [{ permissions: ['certification.read'] }],
          lock: true,
        })
      )
        roles.add(role);
    return roles;
  }

  /** Refuses unless the actor is linked to the leader of the approved team. */
  requireTeamLeader(actor: ActorContext, steps: readonly StepRow[]) {
    const team = approvedTeam(steps);
    if (
      !team?.members.some(
        (member) =>
          member.role === 'team_leader' &&
          member.workspaceMembershipId === actor.workspaceMembershipId,
      )
    )
      throw stepConflict(
        'CERTIFICATION_NOT_TEAM_LEADER',
        'Only the leader of the approved audit team records this.',
      );
  }

  /** Whether the actor is linked to a member of any proposed team version. */
  onTeam(actor: ActorContext, steps: readonly StepRow[]): boolean {
    return steps
      .filter((row) => row.step === 'team')
      .some((row) =>
        teamMembershipIds(teamVersion(row).value).includes(
          actor.workspaceMembershipId,
        ),
      );
  }

  /** The latest application facts once the review accepted them. */
  acceptedApplication(steps: readonly StepRow[]): ApplicationFacts {
    const review = latest(steps, 'application_review');
    const application = latest(steps, 'application');
    if (
      !review ||
      !application ||
      reviewVersion(review).value.outcome !== 'accepted'
    )
      throw stepConflict(
        'CERTIFICATION_APPLICATION_NOT_ACCEPTED',
        'The duration is determined after the application review accepts it.',
      );
    return applicationVersion(application).value;
  }

  private async receipt(
    actor: ActorContext,
    companyId: string,
    kind: CommandKind,
    key: string,
  ) {
    const [receipt] = await this.database.connection
      .select()
      .from(certificationReceipts)
      .where(
        and(
          eq(certificationReceipts.workspaceId, actor.workspaceId),
          eq(certificationReceipts.companyId, companyId),
          eq(
            certificationReceipts.actorMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(certificationReceipts.commandKind, kind),
          eq(certificationReceipts.idempotencyKey, key),
        ),
      );
    return receipt;
  }

  read<T>(
    actor: ActorContext,
    role: CertificationRole,
    work: (companyId: string) => Promise<T>,
  ): Promise<T> {
    return this.protect(() =>
      this.database.transaction(async () =>
        work(await this.authorize(actor, role)),
      ),
    );
  }

  readSnapshot<T>(
    actor: ActorContext,
    role: CertificationRole,
    work: (companyId: string) => Promise<T>,
  ): Promise<T> {
    return this.protect(() =>
      readConsistently(this.database, async () =>
        work(await this.authorize(actor, role)),
      ),
    );
  }

  /**
   * Certification grants, then the Project access every Case lives under,
   * both rechecked inside the transaction. Checking Project access before any
   * Case or receipt lookup keeps hidden and missing Cases indistinguishable
   * and stops a replay once that access is revoked.
   */
  async authorize(
    actor: ActorContext,
    role: CertificationRole,
    options: { lock: boolean } = { lock: true },
  ): Promise<string> {
    const companyId = (
      await this.authorization.requirePermissions(actor, {
        permissions: [CERTIFICATION_REQUIRED_PERMISSION[role]],
        prerequisites: [{ permissions: ['certification.read'] }],
        lock: options.lock,
      })
    ).companyId;
    if (
      (
        await this.authorization.requirePermissions(actor, {
          permissions: ['project.read'],
          lock: options.lock,
          prerequisites: [
            {
              permissions: ['client.read'],
              workspaceAlternative: 'client.manage',
            },
          ],
        })
      ).companyId !== companyId
    )
      throw new ForbiddenException();
    return companyId;
  }

  private async protect<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (certificateNumberConflict(error))
        throw stepConflict(
          'CERTIFICATION_CERTIFICATE_NUMBER_TAKEN',
          'This Certificate number is already used in the Company.',
        );
      throw new InternalServerErrorException(
        'Certification operation is unavailable.',
      );
    }
  }
}

/**
 * Equal recorded step values, whatever the release that stored the earlier
 * version: both go through the step's own stored decoder, so a field added
 * later compares with its default and a converted value with its new form.
 */
function sameStepValue(stored: StepRow, payload: object): boolean {
  const json: unknown = JSON.parse(JSON.stringify(payload));
  const earlier: unknown = JSON.parse(
    JSON.stringify(stepVersion(stored).value),
  );
  return sameValue(earlier, stepVersion({ ...stored, payload: json }).value);
}

/** Drizzle wraps the PostgreSQL error in a cause; inspect only its closed code/constraint. */
function certificateNumberConflict(error: unknown): boolean {
  let candidate = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (candidate === null || typeof candidate !== 'object') return false;
    if (
      'code' in candidate &&
      candidate.code === '23505' &&
      'constraint' in candidate &&
      candidate.constraint === 'certification_certificates_number_unique'
    )
      return true;
    if (!('cause' in candidate)) return false;
    candidate = candidate.cause;
  }
  return false;
}
