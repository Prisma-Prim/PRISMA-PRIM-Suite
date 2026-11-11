import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireIdempotencyKey } from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import {
  advisoryTransactionLock,
  commandFingerprint,
  idempotencyConflict,
  runIdempotentCommand,
  staleVersionConflict,
} from '../command/idempotent-command.js';
import { DatabaseContext } from '../database/database-context.js';
import { certificationDeadlineSets } from '../database/schema/certification.js';
import {
  DEADLINE_KINDS,
  type DeadlineSetVersion,
} from './certification-exchanges.js';
import { deadlineSetCommand } from './certification-exchanges.validation.js';

/** A Company's procedure deadline set: the current version and its history. */
export interface DeadlineSetHistory {
  current: DeadlineSetVersion | null;
  /** Every version, the latest first. */
  history: DeadlineSetVersion[];
}

/**
 * The certifying Company's procedure deadline set (dossier control PRD
 * §8.2): a versioned configuration that a member holding the Company
 * administration right that assigns the certification bundles reads and
 * changes. Nothing is seeded.
 */
@Injectable()
export class CertificationProcedureService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly accountability: AccountabilityService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
  ) {}

  readDeadlines(actor: ActorContext): Promise<DeadlineSetHistory> {
    return this.protect(() =>
      this.database.transaction(
        async () => {
          const companyId =
            await this.authorization.requireCompanyAssignmentAdministration(
              actor,
              { lock: false },
            );
          const rows = await this.database.connection
            .select()
            .from(certificationDeadlineSets)
            .where(
              and(
                eq(certificationDeadlineSets.workspaceId, actor.workspaceId),
                eq(certificationDeadlineSets.companyId, companyId),
              ),
            )
            .orderBy(desc(certificationDeadlineSets.version));
          const history = rows.map(deadlineSetVersion);
          return { current: history[0] ?? null, history };
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      ),
    );
  }

  /** Records the next version of the set; the expected version guards it. */
  configureDeadlines({
    actor,
    body,
    key,
  }: {
    actor: ActorContext;
    body: unknown;
    key: string | undefined;
  }): Promise<DeadlineSetVersion> {
    const idempotencyKey = requireIdempotencyKey(key);
    return this.protect(() =>
      runIdempotentCommand(this.database, {
        fingerprint: commandFingerprint({ body }),
        authorize: () =>
          this.authorization.requireCompanyAssignmentAdministration(actor, {
            lock: true,
          }),
        lockParts: (companyId) => [
          'certification-procedure',
          actor.workspaceId,
          companyId,
          actor.workspaceMembershipId,
          idempotencyKey,
        ],
        findReceipt: async (companyId) => {
          const [row] = await this.database.connection
            .select()
            .from(certificationDeadlineSets)
            .where(
              and(
                eq(certificationDeadlineSets.workspaceId, actor.workspaceId),
                eq(certificationDeadlineSets.companyId, companyId),
                eq(
                  certificationDeadlineSets.actorMembershipId,
                  actor.workspaceMembershipId,
                ),
                eq(certificationDeadlineSets.idempotencyKey, idempotencyKey),
              ),
            );
          return row;
        },
        conflict: () => idempotencyConflict(),
        // An exact retry answers the version it recorded, never a newer one.
        replay: (_companyId, receipt) =>
          Promise.resolve(deadlineSetVersion(receipt)),
        execute: async (companyId) => {
          const input = deadlineSetCommand(body);
          await advisoryTransactionLock(this.database.connection, [
            'certification-procedure-set',
            actor.workspaceId,
            companyId,
          ]);
          const [current] = await this.database.connection
            .select()
            .from(certificationDeadlineSets)
            .where(
              and(
                eq(certificationDeadlineSets.workspaceId, actor.workspaceId),
                eq(certificationDeadlineSets.companyId, companyId),
              ),
            )
            .orderBy(desc(certificationDeadlineSets.version))
            .limit(1);
          const previous = current ? deadlineSetVersion(current) : null;
          if ((previous?.version ?? 0) !== input.expectedVersion)
            throw staleVersionConflict(
              'Reload the procedure deadlines before changing them.',
            );
          if (
            previous &&
            DEADLINE_KINDS.every(
              (kind) => previous.days[kind] === input.days[kind],
            )
          )
            throw new ConflictException({
              code: 'CERTIFICATION_DEADLINES_UNCHANGED',
              message: 'The procedure deadlines already have these values.',
            });
          const version = (previous?.version ?? 0) + 1;
          const now = this.clock.now();
          const [recorded] = await this.database.connection
            .insert(certificationDeadlineSets)
            .values({
              workspaceId: actor.workspaceId,
              companyId,
              version,
              stagePlanSentDays: input.days.stage_plan_sent,
              auditDossierTransmittedDays: input.days.audit_dossier_transmitted,
              stage2ReportReleasedDays: input.days.stage_2_report_released,
              idempotencyKey,
              fingerprint: commandFingerprint({ body }),
              actorMembershipId: actor.workspaceMembershipId,
              actorInternalUserId: actor.internalUserId,
              actorDisplayName: actor.displayName,
              recordedAt: now,
            })
            .returning();
          if (!recorded) throw new InternalServerErrorException();
          await this.accountability.recordCertificationProcedureEvent({
            actor,
            companyId,
            version,
            occurredAt: now,
            action: 'certification_procedure.deadlines_configured',
            metadata: { version },
          });
          return deadlineSetVersion(recorded);
        },
      }),
    );
  }

  private async protect<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Certification operation is unavailable.',
      );
    }
  }
}

/** A stored deadline set version, as the register and the Case read show it. */
export function deadlineSetVersion(
  row: typeof certificationDeadlineSets.$inferSelect,
): DeadlineSetVersion {
  return {
    version: row.version,
    days: {
      stage_plan_sent: row.stagePlanSentDays,
      audit_dossier_transmitted: row.auditDossierTransmittedDays,
      stage_2_report_released: row.stage2ReportReleasedDays,
    },
    configuredBy: {
      workspaceMembershipId: row.actorMembershipId,
      displayName: row.actorDisplayName,
    },
    configuredAt: row.recordedAt.toISOString(),
  };
}
