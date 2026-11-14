import { formatMessage } from '../localization/messages';
import {
  useCertificationCopy,
  type CertificationMessageKey,
} from './certification.copy';
import { ActingRow, IndependenceRow } from './CertificationAttribution';
import { useAttachmentReference } from './CertificationDocumentViews';
import type { DocumentRegister } from './certification-response';
import {
  IMPARTIALITY_DECLARATIONS,
  awaitsVerification,
  declaresConflict,
  type AuditTeam,
  type DeclarationState,
  type ImpartialityDeclaration,
  type TeamDecision,
  type TeamRole,
} from './certification-team';

/** Display names of the Workspace memberships known in the read Case. */
export type KnownPeople = ReadonlyMap<string, string>;

export function teamRoleLabel(role: TeamRole): CertificationMessageKey {
  switch (role) {
    case 'team_leader':
      return 'teamRoleLeader';
    case 'auditor':
      return 'teamRoleAuditor';
    case 'technical_expert':
      return 'teamRoleTechnicalExpert';
    case 'observer':
      return 'teamRoleObserver';
  }
  return unexpected(role);
}

export function declarationLabel(
  declaration: ImpartialityDeclaration,
): CertificationMessageKey {
  switch (declaration) {
    case 'noConsultancy':
      return 'declarationNoConsultancy';
    case 'noEmployment':
      return 'declarationNoEmployment';
    case 'noManagementInvolvement':
      return 'declarationNoManagementInvolvement';
    case 'confidentiality':
      return 'declarationConfidentiality';
  }
  return unexpected(declaration);
}

export function declarationStateLabel(
  state: DeclarationState,
): CertificationMessageKey {
  switch (state) {
    case 'confirmed':
      return 'declarationConfirmed';
    case 'conflict':
      return 'declarationConflict';
    case 'to_verify':
      return 'declarationToVerify';
  }
  return unexpected(state);
}

/**
 * Every member with the exact recorded values: role, link, category,
 * competence and each declaration, a conflict or a point to verify with its
 * description; then the documented impartiality analysis and its evidence.
 */
export function TeamView({
  team,
  people,
  register,
}: {
  team: AuditTeam;
  people: KnownPeople;
  register: DocumentRegister;
}) {
  const copy = useCertificationCopy();
  const reference = useAttachmentReference();
  const analysis = team.impartialityAnalysis;
  return (
    <>
      <ol className="certification-team">
        {team.members.map((member, index) => {
          const linked = member.workspaceMembershipId;
          return (
            <li key={index}>
              <strong>
                {member.name} — {copy(teamRoleLabel(member.role))}
              </strong>
              {declaresConflict(member) && (
                <span className="certification-status certification-status-rejected">
                  {copy(
                    awaitsVerification(member)
                      ? 'declarationsToVerify'
                      : 'conflictDeclared',
                  )}
                </span>
              )}
              <dl className="certification-facts">
                <div>
                  <dt>{copy('teamMemberLink')}</dt>
                  <dd>
                    {linked === null
                      ? copy('teamMemberNotLinked')
                      : (people.get(linked) ?? copy('teamMemberLinkedUnknown'))}
                  </dd>
                </div>
                <div>
                  <dt>{copy('holdsCategory')}</dt>
                  <dd>{copy(member.holdsCategory ? 'yes' : 'no')}</dd>
                </div>
                <div>
                  <dt>{copy('competenceNote')}</dt>
                  <dd>{member.competenceNote}</dd>
                </div>
                {IMPARTIALITY_DECLARATIONS.map((declaration) => (
                  <div key={declaration}>
                    <dt>{copy(declarationLabel(declaration))}</dt>
                    <dd>
                      {copy(
                        declarationStateLabel(member.declarations[declaration]),
                      )}
                    </dd>
                  </div>
                ))}
                {member.conflictNote !== null && (
                  <div>
                    <dt>{copy('conflictNote')}</dt>
                    <dd>{member.conflictNote}</dd>
                  </div>
                )}
              </dl>
            </li>
          );
        })}
      </ol>
      <dl className="certification-facts">
        <div>
          <dt>{copy('impartialityAnalysis')}</dt>
          <dd>{analysis?.note ?? copy('impartialityAnalysisNone')}</dd>
        </div>
        {analysis && analysis.evidenceAttachmentIds.length > 0 && (
          <div>
            <dt>{copy('impartialityAnalysisEvidence')}</dt>
            <dd>
              <ul>
                {analysis.evidenceAttachmentIds.map((attachmentId) => {
                  const attached = register.items.find(
                    (item) => item.id === attachmentId,
                  );
                  return (
                    <li key={attachmentId}>
                      {attached ? reference(attached) : attachmentId}
                    </li>
                  );
                })}
              </ul>
            </dd>
          </div>
        )}
      </dl>
    </>
  );
}

/**
 * The decided team version, the decision and the reason for a return, who
 * decided on behalf of the certification body and the attestation.
 */
export function DecisionView({
  decision,
  register,
}: {
  decision: TeamDecision;
  register: DocumentRegister;
}) {
  const copy = useCertificationCopy();
  return (
    <dl className="certification-facts">
      <div>
        <dt>{copy('decisionTeamVersion')}</dt>
        <dd>
          {formatMessage(copy('version'), { version: decision.teamVersion })}
        </dd>
      </div>
      <div>
        <dt>{copy('decisionChoice')}</dt>
        <dd>
          <span
            className={`certification-status certification-status-${decision.decision === 'approved' ? 'open' : 'rejected'}`}
          >
            {copy(decisionLabel(decision.decision))}
          </span>
        </dd>
      </div>
      {decision.decision === 'returned' && (
        <div>
          <dt>{copy('decisionReason')}</dt>
          <dd>{decision.reason}</dd>
        </div>
      )}
      <ActingRow
        label="actingTeamDecisionView"
        act={decision.onBehalf}
        register={register}
      />
      <IndependenceRow />
    </dl>
  );
}

export function decisionLabel(
  decision: TeamDecision['decision'],
): CertificationMessageKey {
  return decision === 'approved' ? 'decisionApproved' : 'decisionReturned';
}

function unexpected(value: never): never {
  throw new Error(`Unexpected Certification team value: ${String(value)}`);
}
