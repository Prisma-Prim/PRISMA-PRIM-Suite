import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { AccountabilityService } from '../accountability/accountability.service.js';
import {
  COMPANY_CONTEXT_ASSIGNMENT_GRANTED_ACTION,
  COMPANY_CONTEXT_ASSIGNMENT_REVOKED_ACTION,
  COMPANY_DIRECTOR_CLIENT_ASSIGNMENT_GRANTED_ACTION,
  COMPANY_DIRECTOR_CLIENT_ASSIGNMENT_REVOKED_ACTION,
  type CanonicalActivityEvent,
} from '../accountability/accountability.types.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  companies,
  companyContextAssignmentCommands,
  companyRoleAssignments,
  internalUsers,
  workspaceMemberships,
} from '../database/schema/index.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from './access-command-validation.js';
import { requireWorkspacePermission } from './access-policy.js';
import type { ActorContext } from './access.types.js';
import {
  COMPANY_TASK_MANAGER_BUNDLE,
  COMPANY_TASK_MANAGER_BUNDLE_LABEL,
  COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE,
  COMPANY_DOCUMENT_REGISTRAR_BUNDLE,
  COMPANY_DOCUMENT_REGISTRAR_BUNDLE_LABEL,
  COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE_LABEL,
  COMPANY_PROJECT_ACCESS_BUNDLE,
  COMPANY_PROJECT_ACCESS_BUNDLE_LABEL,
  COMPANY_CONTEXT_ACCESS_BUNDLE,
  COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL,
  COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE,
  COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL,
  COMPANY_COMMERCIAL_INTAKE_BUNDLE,
  COMPANY_COMMERCIAL_INTAKE_BUNDLE_LABEL,
  isCommercialIntakePermissionSetVersion,
  type CompanyCommercialIntakePermissionSetVersion,
  COMPANY_SERVICE_CATALOGUE_BUNDLE,
  COMPANY_SERVICE_CATALOGUE_BUNDLE_LABEL,
  COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE,
  COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE_LABEL,
  type CompanyDirectorClientPermissionSetVersion,
  type DocumentPermissionSetVersion,
} from './company-permissions.js';
import type {
  CompanyAccessAdministrationState,
  CompanyContextAssignmentRecord,
  GrantCompanyContextAssignmentCommand,
} from './company-context-assignment.types.js';

type Operation = 'grant' | 'revoke';
type CommandRow = typeof companyContextAssignmentCommands.$inferSelect;
type Bundle = typeof companyRoleAssignments.$inferSelect.bundle;
type BundleDefinition = {
  value: Bundle;
  label:
    | typeof COMPANY_TASK_MANAGER_BUNDLE_LABEL
    | typeof COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE_LABEL
    | typeof COMPANY_DOCUMENT_REGISTRAR_BUNDLE_LABEL
    | typeof COMPANY_PROJECT_ACCESS_BUNDLE_LABEL
    | typeof COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL
    | typeof COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL
    | typeof COMPANY_COMMERCIAL_INTAKE_BUNDLE_LABEL
    | typeof COMPANY_SERVICE_CATALOGUE_BUNDLE_LABEL
    | typeof COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE_LABEL;
  permissionSetVersion:
    | CompanyDirectorClientPermissionSetVersion
    | DocumentPermissionSetVersion
    | CompanyCommercialIntakePermissionSetVersion
    | null;
};

const TASK_MANAGER_BUNDLE: BundleDefinition = {
  value: COMPANY_TASK_MANAGER_BUNDLE,
  label: COMPANY_TASK_MANAGER_BUNDLE_LABEL,
  permissionSetVersion: 'v1',
};
const CONTEXT_BUNDLE: BundleDefinition = {
  value: COMPANY_CONTEXT_ACCESS_BUNDLE,
  label: COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL,
  permissionSetVersion: null,
};
const DIRECTOR_CLIENT_BUNDLE: BundleDefinition = {
  value: COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE,
  label: COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL,
  permissionSetVersion: 'v2',
};
const DOCUMENT_PROJECT_ORGANIZER_BUNDLE: BundleDefinition = {
  value: COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE,
  label: COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE_LABEL,
  permissionSetVersion: 'v1',
};
const DOCUMENT_REGISTRAR_BUNDLE: BundleDefinition = {
  value: COMPANY_DOCUMENT_REGISTRAR_BUNDLE,
  label: COMPANY_DOCUMENT_REGISTRAR_BUNDLE_LABEL,
  permissionSetVersion: 'v2',
};
const PROJECT_BUNDLE: BundleDefinition = {
  value: COMPANY_PROJECT_ACCESS_BUNDLE,
  label: COMPANY_PROJECT_ACCESS_BUNDLE_LABEL,
  permissionSetVersion: 'v1',
};
// A fresh grant captures v2; existing v1 assignments keep their captured
// version until explicitly revoked and granted again.
const COMMERCIAL_INTAKE_BUNDLE: BundleDefinition = {
  value: COMPANY_COMMERCIAL_INTAKE_BUNDLE,
  label: COMPANY_COMMERCIAL_INTAKE_BUNDLE_LABEL,
  permissionSetVersion: 'v2',
};
const SERVICE_CATALOGUE_BUNDLE: BundleDefinition = {
  value: COMPANY_SERVICE_CATALOGUE_BUNDLE,
  label: COMPANY_SERVICE_CATALOGUE_BUNDLE_LABEL,
  permissionSetVersion: 'v1',
};
const COMMERCIAL_ACTIVITY_READER_BUNDLE: BundleDefinition = {
  value: COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE,
  label: COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE_LABEL,
  permissionSetVersion: 'v1',
};
const ADMINISTRABLE_BUNDLES = [
  COMPANY_TASK_MANAGER_BUNDLE,
  COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE,
  COMPANY_DOCUMENT_REGISTRAR_BUNDLE,
  COMPANY_PROJECT_ACCESS_BUNDLE,
  COMPANY_CONTEXT_ACCESS_BUNDLE,
  COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE,
  COMPANY_COMMERCIAL_INTAKE_BUNDLE,
  COMPANY_SERVICE_CATALOGUE_BUNDLE,
  COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE,
] as const;

@Injectable()
export class CompanyContextAssignmentService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly accountability: AccountabilityService,
  ) {}

  async readAdministrationState(
    actor: ActorContext,
  ): Promise<CompanyAccessAdministrationState> {
    requireWorkspacePermission(actor, 'company.assignment.manage');
    return this.databaseContext.transaction(
      async () => {
        const database = this.databaseContext.connection;
        const members = await database
          .select({
            workspaceMembershipId: workspaceMemberships.id,
            displayName: internalUsers.displayName,
            email: internalUsers.email,
          })
          .from(workspaceMemberships)
          .innerJoin(
            internalUsers,
            and(
              eq(internalUsers.id, workspaceMemberships.internalUserId),
              eq(internalUsers.status, 'active'),
            ),
          )
          .where(
            and(
              eq(workspaceMemberships.workspaceId, actor.workspaceId),
              eq(workspaceMemberships.status, 'active'),
            ),
          )
          .orderBy(
            asc(internalUsers.displayName),
            asc(internalUsers.email),
            asc(workspaceMemberships.id),
          );

        const activeCompanies = await database
          .select({ id: companies.id, displayName: companies.displayName })
          .from(companies)
          .where(
            and(
              eq(companies.workspaceId, actor.workspaceId),
              eq(companies.status, 'active'),
            ),
          )
          .orderBy(asc(companies.displayName), asc(companies.id));

        const assignments = await database
          .select({
            id: companyRoleAssignments.id,
            workspaceMembershipId: companyRoleAssignments.workspaceMembershipId,
            companyId: companyRoleAssignments.companyId,
            bundle: companyRoleAssignments.bundle,
            permissionSetVersion: companyRoleAssignments.permissionSetVersion,
          })
          .from(companyRoleAssignments)
          .innerJoin(
            workspaceMemberships,
            and(
              eq(
                workspaceMemberships.workspaceId,
                companyRoleAssignments.workspaceId,
              ),
              eq(
                workspaceMemberships.id,
                companyRoleAssignments.workspaceMembershipId,
              ),
              eq(workspaceMemberships.status, 'active'),
            ),
          )
          .innerJoin(
            internalUsers,
            and(
              eq(internalUsers.id, workspaceMemberships.internalUserId),
              eq(internalUsers.status, 'active'),
            ),
          )
          .innerJoin(
            companies,
            and(
              eq(companies.workspaceId, companyRoleAssignments.workspaceId),
              eq(companies.id, companyRoleAssignments.companyId),
              eq(companies.status, 'active'),
            ),
          )
          .where(
            and(
              eq(companyRoleAssignments.workspaceId, actor.workspaceId),
              isNull(companyRoleAssignments.revokedAt),
              inArray(companyRoleAssignments.bundle, ADMINISTRABLE_BUNDLES),
            ),
          )
          .orderBy(
            asc(companyRoleAssignments.workspaceMembershipId),
            asc(companyRoleAssignments.companyId),
            asc(companyRoleAssignments.bundle),
          );

        return {
          members,
          companies: activeCompanies,
          assignments: assignments.map((assignment) =>
            assignmentRecord(assignment, true),
          ),
        };
      },
      {
        isolationLevel: 'repeatable read',
        accessMode: 'read only',
      },
    );
  }

  async grant(
    actor: ActorContext,
    command: GrantCompanyContextAssignmentCommand,
  ): Promise<CompanyContextAssignmentRecord> {
    return this.mutate(
      actor,
      CONTEXT_BUNDLE,
      'grant',
      command.workspaceMembershipId,
      command.companyId,
      command.idempotencyKey,
    );
  }

  async grantDirectorClientAccess(
    actor: ActorContext,
    command: GrantCompanyContextAssignmentCommand,
  ): Promise<CompanyContextAssignmentRecord> {
    return this.mutate(
      actor,
      DIRECTOR_CLIENT_BUNDLE,
      'grant',
      command.workspaceMembershipId,
      command.companyId,
      command.idempotencyKey,
    );
  }

  async grantProjectAccess(
    actor: ActorContext,
    command: GrantCompanyContextAssignmentCommand,
  ) {
    return this.mutate(
      actor,
      PROJECT_BUNDLE,
      'grant',
      command.workspaceMembershipId,
      command.companyId,
      command.idempotencyKey,
    );
  }

  async grantCommercialIntake(
    actor: ActorContext,
    command: GrantCompanyContextAssignmentCommand,
  ): Promise<CompanyContextAssignmentRecord> {
    return this.mutate(
      actor,
      COMMERCIAL_INTAKE_BUNDLE,
      'grant',
      command.workspaceMembershipId,
      command.companyId,
      command.idempotencyKey,
    );
  }

  async revokeCommercialIntake(
    actor: ActorContext,
    workspaceMembershipId: unknown,
    companyId: unknown,
    idempotencyKey: string | undefined,
  ): Promise<CompanyContextAssignmentRecord> {
    return this.mutate(
      actor,
      COMMERCIAL_INTAKE_BUNDLE,
      'revoke',
      workspaceMembershipId,
      companyId,
      idempotencyKey,
    );
  }

  async grantServiceCatalogue(
    actor: ActorContext,
    command: GrantCompanyContextAssignmentCommand,
  ): Promise<CompanyContextAssignmentRecord> {
    return this.mutate(
      actor,
      SERVICE_CATALOGUE_BUNDLE,
      'grant',
      command.workspaceMembershipId,
      command.companyId,
      command.idempotencyKey,
    );
  }

  async revokeServiceCatalogue(
    actor: ActorContext,
    workspaceMembershipId: unknown,
    companyId: unknown,
    idempotencyKey: string | undefined,
  ): Promise<CompanyContextAssignmentRecord> {
    return this.mutate(
      actor,
      SERVICE_CATALOGUE_BUNDLE,
      'revoke',
      workspaceMembershipId,
      companyId,
      idempotencyKey,
    );
  }

  async grantCommercialActivityReader(
    actor: ActorContext,
    command: GrantCompanyContextAssignmentCommand,
  ): Promise<CompanyContextAssignmentRecord> {
    return this.mutate(
      actor,
      COMMERCIAL_ACTIVITY_READER_BUNDLE,
      'grant',
      command.workspaceMembershipId,
      command.companyId,
      command.idempotencyKey,
    );
  }

  async revokeCommercialActivityReader(
    actor: ActorContext,
    workspaceMembershipId: unknown,
    companyId: unknown,
    idempotencyKey: string | undefined,
  ): Promise<CompanyContextAssignmentRecord> {
    return this.mutate(
      actor,
      COMMERCIAL_ACTIVITY_READER_BUNDLE,
      'revoke',
      workspaceMembershipId,
      companyId,
      idempotencyKey,
    );
  }

  async revokeProjectAccess(
    actor: ActorContext,
    workspaceMembershipId: unknown,
    companyId: unknown,
    idempotencyKey: string | undefined,
  ) {
    return this.mutate(
      actor,
      PROJECT_BUNDLE,
      'revoke',
      workspaceMembershipId,
      companyId,
      idempotencyKey,
    );
  }

  async revoke(
    actor: ActorContext,
    workspaceMembershipIdValue: unknown,
    companyIdValue: unknown,
    idempotencyKey: string | undefined,
  ): Promise<CompanyContextAssignmentRecord> {
    return this.mutate(
      actor,
      CONTEXT_BUNDLE,
      'revoke',
      workspaceMembershipIdValue,
      companyIdValue,
      idempotencyKey,
    );
  }

  async revokeDirectorClientAccess(
    actor: ActorContext,
    workspaceMembershipIdValue: unknown,
    companyIdValue: unknown,
    idempotencyKey: string | undefined,
  ): Promise<CompanyContextAssignmentRecord> {
    return this.mutate(
      actor,
      DIRECTOR_CLIENT_BUNDLE,
      'revoke',
      workspaceMembershipIdValue,
      companyIdValue,
      idempotencyKey,
    );
  }

  async grantDocumentProjectOrganizer(
    actor: ActorContext,
    command: GrantCompanyContextAssignmentCommand,
  ) {
    return this.mutate(
      actor,
      DOCUMENT_PROJECT_ORGANIZER_BUNDLE,
      'grant',
      command.workspaceMembershipId,
      command.companyId,
      command.idempotencyKey,
    );
  }
  async revokeDocumentProjectOrganizer(
    actor: ActorContext,
    workspaceMembershipId: unknown,
    companyId: unknown,
    idempotencyKey: string | undefined,
  ) {
    return this.mutate(
      actor,
      DOCUMENT_PROJECT_ORGANIZER_BUNDLE,
      'revoke',
      workspaceMembershipId,
      companyId,
      idempotencyKey,
    );
  }
  async grantDocumentRegistrar(
    actor: ActorContext,
    command: GrantCompanyContextAssignmentCommand,
  ) {
    return this.mutate(
      actor,
      DOCUMENT_REGISTRAR_BUNDLE,
      'grant',
      command.workspaceMembershipId,
      command.companyId,
      command.idempotencyKey,
    );
  }
  async revokeDocumentRegistrar(
    actor: ActorContext,
    workspaceMembershipId: unknown,
    companyId: unknown,
    idempotencyKey: string | undefined,
  ) {
    return this.mutate(
      actor,
      DOCUMENT_REGISTRAR_BUNDLE,
      'revoke',
      workspaceMembershipId,
      companyId,
      idempotencyKey,
    );
  }

  grantTaskManager(
    actor: ActorContext,
    command: GrantCompanyContextAssignmentCommand,
  ) {
    return this.mutate(
      actor,
      TASK_MANAGER_BUNDLE,
      'grant',
      command.workspaceMembershipId,
      command.companyId,
      command.idempotencyKey,
    );
  }
  revokeTaskManager(
    actor: ActorContext,
    workspaceMembershipId: unknown,
    companyId: unknown,
    key: string | undefined,
  ) {
    return this.mutate(
      actor,
      TASK_MANAGER_BUNDLE,
      'revoke',
      workspaceMembershipId,
      companyId,
      key,
    );
  }
  private async mutate(
    actor: ActorContext,
    bundle: BundleDefinition,
    operation: Operation,
    workspaceMembershipIdValue: unknown,
    companyIdValue: unknown,
    idempotencyKeyValue: string | undefined,
  ): Promise<CompanyContextAssignmentRecord> {
    requireWorkspacePermission(actor, 'company.assignment.manage');
    const workspaceMembershipId = requireUuid(workspaceMembershipIdValue);
    const companyId = requireUuid(companyIdValue);
    const idempotencyKey = requireIdempotencyKey(idempotencyKeyValue);
    return this.databaseContext.transaction(async () => {
      const replay = await this.findCommand(actor, idempotencyKey);
      if (replay) {
        assertSameCommand(
          replay,
          bundle.value,
          operation,
          workspaceMembershipId,
          companyId,
        );
        return this.commandResult(replay, bundle);
      }
      const target = await this.requireActiveTargets(
        actor.workspaceId,
        workspaceMembershipId,
        companyId,
      );
      const [reserved] = await this.databaseContext.connection
        .insert(companyContextAssignmentCommands)
        .values({
          workspaceId: actor.workspaceId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          bundle: bundle.value,
          idempotencyKey,
          operation,
          targetWorkspaceMembershipId: workspaceMembershipId,
          companyId,
        })
        .onConflictDoNothing()
        .returning();
      if (!reserved) {
        const raced = await this.findCommand(actor, idempotencyKey);
        if (!raced)
          throw new Error('The idempotent command could not be resolved.');
        assertSameCommand(
          raced,
          bundle.value,
          operation,
          workspaceMembershipId,
          companyId,
        );
        return this.commandResult(raced, bundle);
      }
      const assignment =
        operation === 'grant'
          ? await this.applyGrant(
              actor.workspaceId,
              workspaceMembershipId,
              companyId,
              bundle.value,
              bundle.permissionSetVersion,
            )
          : await this.applyRevoke(
              actor.workspaceId,
              workspaceMembershipId,
              companyId,
              bundle.value,
            );
      await this.databaseContext.connection
        .update(companyContextAssignmentCommands)
        .set({ resultAssignmentId: assignment.id })
        .where(eq(companyContextAssignmentCommands.id, reserved.id));
      if (assignment.changed) {
        await this.accountability.record({
          actor,
          action: assignmentAction(bundle.value, operation),
          target: {
            type: 'company_role_assignment',
            assignmentId: assignment.id,
            companyId,
            workspaceMembershipId,
            internalUserId: target.internalUserId,
          },
          metadata: { bundle: bundle.label },
          transitionId: reserved.id,
        });
      }
      return assignmentRecord(assignment, operation === 'grant');
    });
  }

  private async requireActiveTargets(
    workspaceId: string,
    workspaceMembershipId: string,
    companyId: string,
  ): Promise<{ internalUserId: string }> {
    const [target] = await this.databaseContext.connection
      .select({ internalUserId: workspaceMemberships.internalUserId })
      .from(workspaceMemberships)
      .innerJoin(
        internalUsers,
        eq(internalUsers.id, workspaceMemberships.internalUserId),
      )
      .innerJoin(
        companies,
        eq(companies.workspaceId, workspaceMemberships.workspaceId),
      )
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspaceId),
          eq(workspaceMemberships.id, workspaceMembershipId),
          eq(workspaceMemberships.status, 'active'),
          eq(internalUsers.status, 'active'),
          eq(companies.id, companyId),
          eq(companies.status, 'active'),
        ),
      )
      .for('update')
      .limit(1);
    if (!target) throw new ForbiddenException();
    return target;
  }

  private async applyGrant(
    workspaceId: string,
    workspaceMembershipId: string,
    companyId: string,
    bundle: Bundle,
    permissionSetVersion: BundleDefinition['permissionSetVersion'],
  ) {
    const active = await this.findActiveAssignment(
      workspaceId,
      workspaceMembershipId,
      companyId,
      bundle,
    );
    if (active) return { ...active, changed: false };

    const [changed] = await this.databaseContext.connection
      .insert(companyRoleAssignments)
      .values({
        workspaceId,
        workspaceMembershipId,
        companyId,
        bundle,
        permissionSetVersion,
      })
      .onConflictDoNothing({
        target: [
          companyRoleAssignments.workspaceId,
          companyRoleAssignments.companyId,
          companyRoleAssignments.workspaceMembershipId,
          companyRoleAssignments.bundle,
        ],
        where: isNull(companyRoleAssignments.revokedAt),
      })
      .returning();
    if (changed) return { ...changed, changed: true };
    const raced = await this.findActiveAssignment(
      workspaceId,
      workspaceMembershipId,
      companyId,
      bundle,
    );
    if (!raced) throw new Error('The fresh assignment could not be resolved.');
    return { ...raced, changed: false };
  }

  private async applyRevoke(
    workspaceId: string,
    workspaceMembershipId: string,
    companyId: string,
    bundle: Bundle,
  ) {
    const [changed] = await this.databaseContext.connection
      .update(companyRoleAssignments)
      .set({ revokedAt: sql`now()`, updatedAt: sql`now()` })
      .where(
        and(
          eq(companyRoleAssignments.workspaceId, workspaceId),
          eq(
            companyRoleAssignments.workspaceMembershipId,
            workspaceMembershipId,
          ),
          eq(companyRoleAssignments.companyId, companyId),
          eq(companyRoleAssignments.bundle, bundle),
          isNull(companyRoleAssignments.revokedAt),
        ),
      )
      .returning();
    const assignment =
      changed ??
      (await this.findLatestAssignment(
        workspaceId,
        workspaceMembershipId,
        companyId,
        bundle,
      ));
    if (!assignment) throw new ForbiddenException();
    return { ...assignment, changed: Boolean(changed) };
  }

  private async findCommand(actor: ActorContext, idempotencyKey: string) {
    const [command] = await this.databaseContext.connection
      .select()
      .from(companyContextAssignmentCommands)
      .where(
        and(
          eq(companyContextAssignmentCommands.workspaceId, actor.workspaceId),
          eq(
            companyContextAssignmentCommands.actorWorkspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(companyContextAssignmentCommands.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return command;
  }

  private async findActiveAssignment(
    workspaceId: string,
    workspaceMembershipId: string,
    companyId: string,
    bundle: Bundle,
  ) {
    const [assignment] = await this.databaseContext.connection
      .select()
      .from(companyRoleAssignments)
      .where(
        and(
          eq(companyRoleAssignments.workspaceId, workspaceId),
          eq(
            companyRoleAssignments.workspaceMembershipId,
            workspaceMembershipId,
          ),
          eq(companyRoleAssignments.companyId, companyId),
          eq(companyRoleAssignments.bundle, bundle),
          isNull(companyRoleAssignments.revokedAt),
        ),
      )
      .limit(1);
    return assignment;
  }

  private async findLatestAssignment(
    workspaceId: string,
    workspaceMembershipId: string,
    companyId: string,
    bundle: Bundle,
  ) {
    const [assignment] = await this.databaseContext.connection
      .select()
      .from(companyRoleAssignments)
      .where(
        and(
          eq(companyRoleAssignments.workspaceId, workspaceId),
          eq(
            companyRoleAssignments.workspaceMembershipId,
            workspaceMembershipId,
          ),
          eq(companyRoleAssignments.companyId, companyId),
          eq(companyRoleAssignments.bundle, bundle),
        ),
      )
      .orderBy(
        desc(companyRoleAssignments.createdAt),
        desc(companyRoleAssignments.id),
      )
      .limit(1);
    return assignment;
  }

  private async commandResult(
    command: CommandRow,
    bundle: BundleDefinition,
  ): Promise<CompanyContextAssignmentRecord> {
    if (!command.resultAssignmentId)
      throw new Error('The idempotent command is incomplete.');
    const [assignment] = await this.databaseContext.connection
      .select()
      .from(companyRoleAssignments)
      .where(
        and(
          eq(companyRoleAssignments.workspaceId, command.workspaceId),
          eq(companyRoleAssignments.id, command.resultAssignmentId),
          eq(companyRoleAssignments.bundle, bundle.value),
        ),
      )
      .limit(1);
    if (!assignment)
      throw new Error('The idempotent assignment result is unavailable.');
    return assignmentRecord(assignment, command.operation === 'grant');
  }
}

// Derived from the recording contract so a new assignment bundle cannot record
// an action Accountability does not own.
type CompanyAssignmentAction = Extract<
  CanonicalActivityEvent,
  { target: { type: 'company_role_assignment' } }
>['action'];

function assignmentAction(
  bundle: Bundle,
  operation: Operation,
): CompanyAssignmentAction {
  const granted = operation === 'grant';
  switch (bundle) {
    case COMPANY_TASK_MANAGER_BUNDLE:
      return granted
        ? 'company_task_manager_assignment.granted'
        : 'company_task_manager_assignment.revoked';
    case COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE:
      return granted
        ? 'company_document_project_organizer_assignment.granted'
        : 'company_document_project_organizer_assignment.revoked';
    case COMPANY_DOCUMENT_REGISTRAR_BUNDLE:
      return granted
        ? 'company_document_registrar_assignment.granted'
        : 'company_document_registrar_assignment.revoked';
    case COMPANY_PROJECT_ACCESS_BUNDLE:
      return granted
        ? 'company_project_assignment.granted'
        : 'company_project_assignment.revoked';
    case COMPANY_CONTEXT_ACCESS_BUNDLE:
      return granted
        ? COMPANY_CONTEXT_ASSIGNMENT_GRANTED_ACTION
        : COMPANY_CONTEXT_ASSIGNMENT_REVOKED_ACTION;
    case COMPANY_COMMERCIAL_INTAKE_BUNDLE:
      return granted
        ? 'company_commercial_intake_assignment.granted'
        : 'company_commercial_intake_assignment.revoked';
    case COMPANY_SERVICE_CATALOGUE_BUNDLE:
      return granted
        ? 'company_service_catalogue_assignment.granted'
        : 'company_service_catalogue_assignment.revoked';
    case COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE:
      return granted
        ? 'company_commercial_activity_reader_assignment.granted'
        : 'company_commercial_activity_reader_assignment.revoked';
    case COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE:
      return granted
        ? COMPANY_DIRECTOR_CLIENT_ASSIGNMENT_GRANTED_ACTION
        : COMPANY_DIRECTOR_CLIENT_ASSIGNMENT_REVOKED_ACTION;
  }
}

function assertSameCommand(
  command: CommandRow,
  bundle: Bundle,
  operation: Operation,
  workspaceMembershipId: string,
  companyId: string,
): void {
  if (
    command.bundle !== bundle ||
    command.operation !== operation ||
    command.targetWorkspaceMembershipId !== workspaceMembershipId ||
    command.companyId !== companyId
  ) {
    throw new BadRequestException(
      'Idempotency-Key was already used for another command.',
    );
  }
  if (!command.resultAssignmentId)
    throw new Error('The idempotent command is incomplete.');
}

function assignmentRecord(
  assignment: Pick<
    typeof companyRoleAssignments.$inferSelect,
    | 'id'
    | 'workspaceMembershipId'
    | 'companyId'
    | 'bundle'
    | 'permissionSetVersion'
  >,
  active: boolean,
): CompanyContextAssignmentRecord {
  const base = {
    id: assignment.id,
    workspaceMembershipId: assignment.workspaceMembershipId,
    companyId: assignment.companyId,
    active,
  };
  switch (assignment.bundle) {
    case COMPANY_TASK_MANAGER_BUNDLE:
      if (assignment.permissionSetVersion !== 'v1')
        throw new Error('Invalid Company Task Manager version.');
      return {
        ...base,
        bundle: COMPANY_TASK_MANAGER_BUNDLE_LABEL,
        permissionSetVersion: 'v1',
      };
    case COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE:
      if (assignment.permissionSetVersion !== 'v1')
        throw new Error('Invalid Document Project Organizer version.');
      return {
        ...base,
        bundle: COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE_LABEL,
        permissionSetVersion: 'v1',
      };
    case COMPANY_DOCUMENT_REGISTRAR_BUNDLE:
      if (
        assignment.permissionSetVersion !== 'v1' &&
        assignment.permissionSetVersion !== 'v2'
      )
        throw new Error('Invalid Document Registrar version.');
      return {
        ...base,
        bundle: COMPANY_DOCUMENT_REGISTRAR_BUNDLE_LABEL,
        permissionSetVersion: assignment.permissionSetVersion,
      };
    case COMPANY_PROJECT_ACCESS_BUNDLE:
      if (assignment.permissionSetVersion !== 'v1')
        throw new Error('Invalid Company Project assignment version.');
      return {
        ...base,
        bundle: COMPANY_PROJECT_ACCESS_BUNDLE_LABEL,
        permissionSetVersion: 'v1',
      };

    case COMPANY_CONTEXT_ACCESS_BUNDLE:
      return {
        ...base,
        bundle: COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL,
        permissionSetVersion: null,
      };
    case COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE:
      if (
        assignment.permissionSetVersion !== 'v1' &&
        assignment.permissionSetVersion !== 'v2'
      ) {
        throw new Error(
          'The Company Director Client assignment version is invalid.',
        );
      }
      return {
        ...base,
        bundle: COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL,
        permissionSetVersion: assignment.permissionSetVersion,
      };
    case COMPANY_COMMERCIAL_INTAKE_BUNDLE:
      if (
        !isCommercialIntakePermissionSetVersion(assignment.permissionSetVersion)
      )
        throw new Error('Invalid Company Commercial Intake version.');
      return {
        ...base,
        bundle: COMPANY_COMMERCIAL_INTAKE_BUNDLE_LABEL,
        permissionSetVersion: assignment.permissionSetVersion,
      };
    case COMPANY_SERVICE_CATALOGUE_BUNDLE:
      if (assignment.permissionSetVersion !== 'v1')
        throw new Error('Invalid Company Service Catalogue version.');
      return {
        ...base,
        bundle: COMPANY_SERVICE_CATALOGUE_BUNDLE_LABEL,
        permissionSetVersion: 'v1',
      };
    case COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE:
      if (assignment.permissionSetVersion !== 'v1')
        throw new Error('Invalid Company Commercial Activity Reader version.');
      return {
        ...base,
        bundle: COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE_LABEL,
        permissionSetVersion: 'v1',
      };
  }
}
