import type { ApiRequest, ApiResult } from '../api/authenticated-api-client';

type Guard<T> = (value: unknown) => value is T;
type Value<T> = T extends Guard<infer Result> ? Result : never;
type OptionalKeys<S> = {
  [K in keyof S]: undefined extends Value<S[K]> ? K : never;
}[keyof S];
type Simplify<T> = { [K in keyof T]: T[K] };
type ObjectValue<S> = Simplify<
  { -readonly [K in Exclude<keyof S, OptionalKeys<S>>]: Value<S[K]> } & {
    -readonly [K in OptionalKeys<S>]?: Value<S[K]>;
  }
>;

function object<const S extends Record<string, Guard<unknown>>>(
  shape: S,
): Guard<ObjectValue<S>> {
  return (value): value is ObjectValue<S> => {
    if (!isRecord(value)) return false;
    for (const key in shape) {
      const check = shape[key];
      if (check === undefined || !check(value[key])) return false;
    }
    return true;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isString(value: unknown): value is string {
  return typeof value === 'string';
}
function isTrue(value: unknown): value is true {
  return value === true;
}
function isOpaque(value: unknown): value is unknown {
  // Unknown captures have no representation claim at this boundary.
  void value;
  return true;
}
function literal<const T extends string[]>(...values: T): Guard<T[number]> {
  return (value): value is T[number] =>
    typeof value === 'string' && values.some((expected) => expected === value);
}
function array<T>(check: Guard<T>): Guard<T[]> {
  return (value): value is T[] => {
    if (!Array.isArray(value)) return false;
    const items: unknown[] = value;
    for (const item of items) if (!check(item)) return false;
    return true;
  };
}
function optional<T>(check: Guard<T>): Guard<T | undefined> {
  return (value): value is T | undefined => value === undefined || check(value);
}
// This representation contract derives the public type. Feature-owned opaque
// captures are preserved; their authority is interpreted at the feature boundary.
const isActorContext = object({
  internalUserId: isString,
  workspaceMembershipId: isString,
  workspaceId: isString,
  workspaceName: isString,
  displayName: isString,
  email: isString,
  active: isTrue,
  workspacePermissions: array(
    literal(
      'company.manage',
      'company.assignment.manage',
      'client.manage',
      'member.invite',
    ),
  ),
  activeCompany: optional(
    object({
      id: isString,
      displayName: isString,
      missionPlanGrants: optional(isOpaque),
      offerModelGrants: optional(isOpaque),
      contractModelGrants: optional(isOpaque),
      taskPermissions: optional(array(literal('task.read', 'task.manage'))),
      taskPermissionAssignmentId: optional(isString),
      taskPermissionSetVersion: optional(literal('v1')),
      missionApplicabilityProposalPermissions: optional(
        array(literal('project.mission_applicability.propose')),
      ),
      missionApplicabilityCoordinatorAssignmentId: optional(isString),
      missionApplicabilityCoordinatorPermissionSetVersion: optional(
        literal('v1'),
      ),
      missionApplicabilityDecisionPermissions: optional(
        array(
          literal(
            'project.mission_applicability.decide',
            'project.mission_applicability.restore',
          ),
        ),
      ),
      missionApplicabilityApproverAssignmentId: optional(isString),
      missionApplicabilityApproverPermissionSetVersion: optional(literal('v1')),
      missionResultReviewPermissions: optional(
        array(literal('project.mission_result.review')),
      ),
      missionResultReviewerAssignmentId: optional(isString),
      missionResultReviewerPermissionSetVersion: optional(literal('v1')),
      taskResultPermissions: optional(array(literal('task.result.record'))),
      taskResultRecorderAssignmentId: optional(isString),
      taskResultRecorderPermissionSetVersion: optional(literal('v1')),
      projectPermissions: optional(
        array(literal('project.read', 'project.create', 'project.update')),
      ),
      projectPermissionAssignmentId: optional(isString),
      projectPermissionSetVersion: optional(literal('v1', 'v2')),
      projectApproverPermissions: optional(
        array(literal('project.lifecycle.transition', 'project.close')),
      ),
      projectApproverPermissionAssignmentId: optional(isString),
      projectApproverPermissionSetVersion: optional(literal('v1')),
      commercialIntakePermissions: optional(
        array(
          literal(
            'commercial.request.read',
            'commercial.request.create',
            'commercial.opportunity.read',
            'commercial.opportunity.create',
            'commercial.opportunity.next_action.update',
            'commercial.request.client.associate',
            'commercial.opportunity.stage.set',
          ),
        ),
      ),
      commercialIntakePermissionAssignmentId: optional(isString),
      commercialIntakePermissionSetVersion: optional(
        literal('v1', 'v2', 'v3', 'v4'),
      ),
      serviceCataloguePermissions: optional(
        array(
          literal(
            'service.definition.read',
            'service.definition.create',
            'commercial.offering.read',
            'commercial.offering.manage',
          ),
        ),
      ),
      serviceCataloguePermissionAssignmentId: optional(isString),
      serviceCataloguePermissionSetVersion: optional(literal('v1')),
      pricingConfigurationPermissions: optional(
        array(
          literal(
            'commercial.offering.read',
            'commercial.pricing.configuration.read',
            'commercial.pricing.configuration.manage',
          ),
        ),
      ),
      pricingConfigurationPermissionAssignmentId: optional(isString),
      pricingConfigurationPermissionSetVersion: optional(literal('v1')),
      pricingUserPermissions: optional(
        array(
          literal(
            'commercial.offering.read',
            'commercial.pricing.configuration.read',
            'commercial.pricing.calculate',
            'commercial.pricing.snapshot.read',
          ),
        ),
      ),
      pricingUserPermissionAssignmentId: optional(isString),
      pricingUserPermissionSetVersion: optional(literal('v1')),
      contractPermissions: optional(
        array(
          literal(
            'commercial.contract.read',
            'commercial.contract.model.select',
            'commercial.contract.model_based.prepare',
            'commercial.contract.model_based.approve',
            'commercial.contract.prepare_pending_offer',
            'commercial.contract.prepare',
            'commercial.contract.project.link',
            'commercial.contract.approve',
            'commercial.contract.signature.record',
          ),
        ),
      ),
      contractEarlyPreparationAssignmentId: optional(isString),
      contractEarlyPreparationPermissionSetVersion: optional(literal('v1')),
      contractPermissionAssignmentId: optional(isString),
      contractPermissionSetVersion: optional(literal('v1', 'v2')),
      contractApproverAssignmentId: optional(isString),
      contractApproverPermissionSetVersion: optional(literal('v1', 'v2')),
      profitabilityContributorPermissions: optional(
        array(
          literal(
            'commercial.profitability_estimate.read',
            'commercial.profitability_estimate.create',
          ),
        ),
      ),
      profitabilityContributorPermissionAssignmentId: optional(isString),
      profitabilityContributorPermissionSetVersion: optional(literal('v1')),
      profitabilityDirectorPermissions: optional(
        array(
          literal(
            'commercial.profitability_estimate.read',
            'commercial.profitability_estimate.decide',
          ),
        ),
      ),
      profitabilityDirectorPermissionAssignmentId: optional(isString),
      profitabilityDirectorPermissionSetVersion: optional(literal('v1')),
      offerPermissions: optional(
        array(
          literal(
            'commercial.offer.read',
            'commercial.offer.prepare',
            'commercial.offer.estimate.prepare',
            'commercial.offer.model.select',
            'commercial.offer.model_based.prepare',
            'commercial.offer.model_based.approve',
            'commercial.offer.model_based.transmission.record',
            'commercial.offer.model_based.response.record',
            'commercial.offer.approve',
            'commercial.offer.response.record',
            'commercial.offer.transmission.record',
            'commercial.pricing.snapshot.read',
          ),
        ),
      ),
      offerPermissionAssignmentId: optional(isString),
      offerPermissionSetVersion: optional(literal('v1', 'v2', 'v3')),
      offerApproverAssignmentId: optional(isString),
      offerApproverPermissionSetVersion: optional(literal('v1', 'v2')),
      pricingAdjustmentPermissions: optional(
        array(literal('commercial.pricing.adjustment.apply')),
      ),
      pricingAdjustmentPermissionAssignmentId: optional(isString),
      pricingAdjustmentPermissionSetVersion: optional(literal('v1')),
      commercialActivityPermissions: optional(
        array(literal('commercial.activity.read')),
      ),
      commercialActivityPermissionSetVersion: optional(literal('v1')),
      opportunityManagerPermissions: optional(
        array(
          literal(
            'commercial.opportunity.assign',
            'commercial.opportunity.outcome.change',
          ),
        ),
      ),
      opportunityManagerPermissionAssignmentId: optional(isString),
      opportunityManagerPermissionSetVersion: optional(literal('v1', 'v2')),
      operationalRiskPermissions: optional(
        array(literal('risk.read', 'risk.record')),
      ),
      operationalRiskReaderAssignmentId: optional(isString),
      operationalRiskReaderPermissionSetVersion: optional(literal('v1')),
      operationalRiskRecorderAssignmentId: optional(isString),
      operationalRiskRecorderPermissionSetVersion: optional(literal('v1')),
      projectStagePermissions: optional(
        array(literal('project.stage.advance')),
      ),
      projectStagePermissionAssignmentId: optional(isString),
      projectStagePermissionSetVersion: optional(literal('v1')),
      projectTemplateConfigurationPermissions: optional(
        array(literal('project.template.version.create')),
      ),
      projectTemplateConfigurationPermissionAssignmentId: optional(isString),
      projectTemplateConfigurationPermissionSetVersion: optional(literal('v1')),
      projectTemplatePermissions: optional(
        array(
          literal(
            'project.template.read',
            'project.template.instantiate',
            'project.template.pilot.read',
            'project.template.pilot.instantiate',
          ),
        ),
      ),
      projectTemplatePermissionAssignmentId: optional(isString),
      projectTemplatePermissionSetVersion: optional(literal('v1', 'v2')),
      salesStageConfigurationPermissions: optional(
        array(literal('commercial.sales_stage.configure')),
      ),
      salesStageConfigurationPermissionAssignmentId: optional(isString),
      salesStageConfigurationPermissionSetVersion: optional(literal('v1')),
      ideasReaderPermissions: optional(array(literal('idea.read'))),
      ideasReaderPermissionAssignmentId: optional(isString),
      ideasReaderPermissionSetVersion: optional(literal('v1')),
      ideasRecorderPermissions: optional(array(literal('idea.record'))),
      ideasRecorderPermissionAssignmentId: optional(isString),
      ideasRecorderPermissionSetVersion: optional(literal('v1')),
      ideasReviewerPermissions: optional(
        array(literal('idea.disposition.record')),
      ),
      ideasReviewerPermissionAssignmentId: optional(isString),
      ideasReviewerPermissionSetVersion: optional(literal('v1')),
      clientPermissions: optional(
        array(
          literal(
            'client.read',
            'client.create',
            'client.update',
            'client.duplicate.resolve',
          ),
        ),
      ),
      documentPermissions: optional(
        array(
          literal(
            'document.received_contract.access',
            'document.mission_deliverable.access',
            'document.read',
            'document.register',
            'document.reference.read',
            'document.correct',
            'document.content.read',
            'document.content.upload',
            'document.version.manage',
            'document.version.designate_official',
            'document.project.manage',
          ),
        ),
      ),
      missionDeliverableAccessAssignmentId: optional(isString),
      missionDeliverableAccessPermissionSetVersion: optional(literal('v1')),
      contractSignatureDeclarerAssignmentId: optional(isString),
      contractSignatureDeclarerPermissionSetVersion: optional(literal('v1')),
      receivedContractAccessAssignmentId: optional(isString),
      receivedContractAccessPermissionSetVersion: optional(literal('v1')),
      documentPermissionSetVersion: optional(literal('v1', 'v2', 'v3')),
      documentPermissionAssignmentId: optional(isString),
      documentContentReaderAssignmentId: optional(isString),
      documentContentReaderPermissionSetVersion: optional(literal('v1')),
      documentContentUploaderAssignmentId: optional(isString),
      documentContentUploaderPermissionSetVersion: optional(literal('v1')),
      documentApproverAssignmentId: optional(isString),
      documentApproverPermissionSetVersion: optional(literal('v1')),
      clientPermissionAssignmentId: optional(isString),
      clientPermissionSetVersion: optional(literal('v1', 'v2')),
    }),
  ),
});

export type ActorContext = Value<typeof isActorContext>;
type CurrentActorSelection = Pick<ApiRequest, 'companyContextId' | 'signal'>;

type CurrentActorTransport = {
  request(
    path: '/access/current-actor',
    request: CurrentActorSelection,
  ): Promise<ApiResult<unknown>>;
};

/** Readable representation proves no live authority beyond the server response. */
export async function readCurrentActor({
  api,
  companyContextId,
  signal,
}: CurrentActorSelection & {
  api: CurrentActorTransport;
}): Promise<ApiResult<ActorContext>> {
  const result = await api.request('/access/current-actor', {
    companyContextId,
    signal,
  });
  if (result.status !== 'ok') return result;
  // Closed legacy versions must match their claimed type. Unknown versions in
  // opaque captures remain feature-local; additive fields remain untouched.
  return isActorContext(result.value)
    ? { status: 'ok', value: result.value }
    : { status: 'error' };
}
