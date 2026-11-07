import type { FormEvent } from 'react';
import { formatMessage } from '../localization/messages';
import { Select, type SelectOption } from '../presentation/Select';
import { useCertificationCopy } from './certification.copy';
import {
  CERTIFICATION_LIMITS,
  type CertificationAttachment,
} from './certification-response';
import {
  DECLARATION_STATES,
  IMPARTIALITY_DECLARATIONS,
  TEAM_LIMITS,
  TEAM_ROLES,
} from './certification-team';
import {
  draftDeclaresConflict,
  emptyTeamMember,
  type DecisionDraft,
  type TeamDraft,
  type TeamMemberDraft,
} from './certification-team-draft';
import { toggleEvidence } from './certification-findings-draft';
import { ActingFieldset } from './CertificationAttribution';
import { useAttachmentReference } from './CertificationDocumentViews';
import {
  declarationLabel,
  declarationStateLabel,
  teamRoleLabel,
} from './CertificationTeamViews';

export type TeamFormProps = {
  idPrefix: string;
  draft: TeamDraft;
  /** A team is proposed: saving records a new version with its reason. */
  correcting: boolean;
  /** The Workspace memberships a member may be linked to. */
  linkOptions: readonly SelectOption[];
  /** The Case's attachments the impartiality analysis may cite. */
  documents: readonly CertificationAttachment[];
  /** The consultant the application declared, whose team needs an analysis. */
  consultant: string | null;
  disabled: boolean;
  submitting: boolean;
  /** Saving waits for a reload of the outdated Case; the draft stays editable. */
  submitBlocked: boolean;
  feedbackId?: string;
  onChange: (draft: TeamDraft) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel?: () => void;
};

/**
 * One to ten members, each with a role, an optional link, the category, a
 * competence note and four explicit declarations, each confirmed, a
 * conflict or to verify; anything not confirmed asks for its description.
 * Then the documented impartiality analysis, required after a declared
 * consultant. A new version also states its reason.
 */
export function TeamForm({
  idPrefix,
  draft,
  correcting,
  linkOptions,
  documents,
  consultant,
  disabled,
  submitting,
  submitBlocked,
  feedbackId,
  onChange,
  onSubmit,
  onCancel,
}: TeamFormProps) {
  const copy = useCertificationCopy();
  const reference = useAttachmentReference();
  const id = (name: string) => `${idPrefix}-${name}`;
  const invalid = feedbackId !== undefined;
  const update = (index: number, patch: Partial<TeamMemberDraft>) =>
    onChange({
      ...draft,
      members: draft.members.map((member, position) =>
        position === index ? { ...member, ...patch } : member,
      ),
    });
  return (
    <form
      className="certification-form"
      aria-label={copy(correcting ? 'correctTeam' : 'proposeTeam')}
      noValidate
      onSubmit={onSubmit}
    >
      {correcting && <p>{copy('teamCorrectionHelp')}</p>}
      <p>{copy('teamHelp')}</p>
      {draft.members.map((member, index) => {
        const number = index + 1;
        const field = (name: string) => id(`member-${index}-${name}`);
        const linkedElsewhere = new Set(
          draft.members.flatMap((other, position) =>
            position !== index && other.workspaceMembershipId
              ? [other.workspaceMembershipId]
              : [],
          ),
        );
        return (
          <fieldset key={index} className="certification-list-entry">
            <legend>{formatMessage(copy('teamMember'), { number })}</legend>
            <label htmlFor={field('name')}>{copy('teamMemberName')}</label>
            <input
              id={field('name')}
              value={member.name}
              maxLength={TEAM_LIMITS.name}
              disabled={disabled}
              required
              aria-invalid={invalid}
              aria-describedby={feedbackId}
              onChange={(event) => update(index, { name: event.target.value })}
            />
            <label htmlFor={field('role')}>{copy('teamMemberRole')}</label>
            <Select
              id={field('role')}
              value={member.role ?? ''}
              placeholder={copy('selectTeamRole')}
              disabled={disabled}
              required
              invalid={invalid}
              describedBy={feedbackId}
              options={TEAM_ROLES.map((role) => ({
                value: role,
                label: copy(teamRoleLabel(role)),
              }))}
              onValueChange={(value) =>
                update(index, {
                  role: TEAM_ROLES.find((role) => role === value) ?? null,
                })
              }
            />
            <label htmlFor={field('link')}>{copy('teamMemberLink')}</label>
            <Select
              id={field('link')}
              value={member.workspaceMembershipId}
              placeholder={copy('teamMemberNotLinked')}
              disabled={disabled}
              invalid={invalid}
              describedBy={[field('link-help'), feedbackId]
                .filter(Boolean)
                .join(' ')}
              options={linkOptions.map((option) => ({
                ...option,
                disabled: linkedElsewhere.has(option.value),
              }))}
              onValueChange={(workspaceMembershipId) =>
                update(index, { workspaceMembershipId })
              }
            />
            <small id={field('link-help')}>{copy('teamMemberLinkHelp')}</small>
            <label className="certification-choice">
              <input
                type="checkbox"
                checked={member.holdsCategory}
                disabled={disabled}
                onChange={(event) =>
                  update(index, { holdsCategory: event.target.checked })
                }
              />
              {copy('holdsCategory')}
            </label>
            <label htmlFor={field('competence')}>
              {copy('competenceNote')}
            </label>
            <textarea
              id={field('competence')}
              value={member.competenceNote}
              maxLength={TEAM_LIMITS.competenceNote}
              disabled={disabled}
              required
              aria-invalid={invalid}
              aria-describedby={feedbackId}
              onChange={(event) =>
                update(index, { competenceNote: event.target.value })
              }
            />
            <fieldset>
              <legend>{copy('declarations')}</legend>
              {IMPARTIALITY_DECLARATIONS.map((declaration) => (
                <fieldset key={declaration} className="certification-criterion">
                  <legend>{copy(declarationLabel(declaration))}</legend>
                  <div className="certification-answers">
                    {DECLARATION_STATES.map((state) => (
                      <label key={state} className="certification-choice">
                        <input
                          type="radio"
                          name={field(declaration)}
                          value={state}
                          checked={member.declarations[declaration] === state}
                          disabled={disabled}
                          onChange={() =>
                            update(index, {
                              declarations: {
                                ...member.declarations,
                                [declaration]: state,
                              },
                            })
                          }
                        />
                        {copy(declarationStateLabel(state))}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </fieldset>
            {draftDeclaresConflict(member) && (
              <div className="certification-field">
                <label htmlFor={field('conflict')}>
                  {copy('conflictNote')}
                </label>
                <textarea
                  id={field('conflict')}
                  value={member.conflictNote}
                  maxLength={TEAM_LIMITS.conflictNote}
                  disabled={disabled}
                  required
                  aria-invalid={invalid}
                  aria-describedby={[field('conflict-help'), feedbackId]
                    .filter(Boolean)
                    .join(' ')}
                  onChange={(event) =>
                    update(index, { conflictNote: event.target.value })
                  }
                />
                <small id={field('conflict-help')}>
                  {copy('conflictNoteHelp')}
                </small>
              </div>
            )}
            {draft.members.length > 1 && (
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  onChange({
                    ...draft,
                    members: draft.members.filter(
                      (_member, position) => position !== index,
                    ),
                  })
                }
              >
                {formatMessage(copy('removeTeamMember'), { number })}
              </button>
            )}
          </fieldset>
        );
      })}
      {draft.members.length < TEAM_LIMITS.members && (
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onChange({
              ...draft,
              members: [...draft.members, emptyTeamMember()],
            })
          }
        >
          {copy('addTeamMember')}
        </button>
      )}
      <fieldset
        aria-describedby={
          [id('analysis-help'), feedbackId].filter(Boolean).join(' ') ||
          undefined
        }
      >
        <legend>{copy('impartialityAnalysis')}</legend>
        <small id={id('analysis-help')}>
          {consultant === null
            ? copy('impartialityAnalysisHelp')
            : formatMessage(copy('impartialityAnalysisRequiredHelp'), {
                consultant,
              })}
        </small>
        <label htmlFor={id('analysis-note')}>
          {copy('impartialityAnalysisNote')}
        </label>
        <textarea
          id={id('analysis-note')}
          value={draft.analysisNote}
          maxLength={TEAM_LIMITS.analysisNote}
          disabled={disabled}
          required={consultant !== null}
          aria-invalid={invalid}
          aria-describedby={feedbackId}
          onChange={(event) =>
            onChange({ ...draft, analysisNote: event.target.value })
          }
        />
        {documents.length > 0 && (
          <fieldset>
            <legend>{copy('impartialityAnalysisEvidence')}</legend>
            {documents.map((attachment) => (
              <label key={attachment.id} className="certification-choice">
                <input
                  type="checkbox"
                  checked={draft.analysisEvidence.includes(attachment.id)}
                  disabled={disabled}
                  onChange={() =>
                    onChange({
                      ...draft,
                      analysisEvidence: toggleEvidence(
                        documents,
                        draft.analysisEvidence,
                        attachment.id,
                      ),
                    })
                  }
                />
                {reference(attachment)}
              </label>
            ))}
          </fieldset>
        )}
      </fieldset>
      {correcting && (
        <>
          <label htmlFor={id('reason')}>{copy('correctionReason')}</label>
          <textarea
            id={id('reason')}
            value={draft.reason}
            maxLength={CERTIFICATION_LIMITS.reason}
            disabled={disabled}
            required
            aria-invalid={invalid}
            aria-describedby={feedbackId}
            onChange={(event) =>
              onChange({ ...draft, reason: event.target.value })
            }
          />
        </>
      )}
      <div className="certification-actions">
        <button
          type="submit"
          className="certification-primary"
          disabled={disabled || submitBlocked}
        >
          {submitting
            ? copy('saving')
            : copy(correcting ? 'saveCorrection' : 'proposeTeam')}
        </button>
        {onCancel && (
          <button type="button" disabled={submitting} onClick={onCancel}>
            {copy('cancel')}
          </button>
        )}
      </div>
    </form>
  );
}

export type DecisionFormProps = {
  idPrefix: string;
  draft: DecisionDraft;
  /** The team version awaiting this decision. */
  teamVersion: number;
  /** A declaration is not confirmed: the team can only be returned. */
  conflictDeclared: boolean;
  /** The Case's attachments a signed decision form may be chosen from. */
  documents: readonly CertificationAttachment[];
  disabled: boolean;
  submitting: boolean;
  submitBlocked: boolean;
  feedbackId?: string;
  onChange: (draft: DecisionDraft) => void;
  onSubmit: (event: FormEvent) => void;
};

/**
 * An explicit approval or return of the latest team version, a return with
 * its reason, the person deciding on behalf of the certification body and
 * the explicit attestation of independence. Approval stays unavailable,
 * with its reason, while a declaration is not confirmed.
 */
export function DecisionForm({
  idPrefix,
  draft,
  teamVersion,
  conflictDeclared,
  documents,
  disabled,
  submitting,
  submitBlocked,
  feedbackId,
  onChange,
  onSubmit,
}: DecisionFormProps) {
  const copy = useCertificationCopy();
  const id = (name: string) => `${idPrefix}-${name}`;
  const invalid = feedbackId !== undefined;
  return (
    <form
      className="certification-form"
      aria-label={copy('recordDecision')}
      noValidate
      onSubmit={onSubmit}
    >
      <p>{formatMessage(copy('decisionHelp'), { version: teamVersion })}</p>
      {conflictDeclared && (
        <p className="certification-blocked">{copy('decisionConflictOnly')}</p>
      )}
      <fieldset>
        <legend>{copy('decisionChoice')}</legend>
        {(
          [
            ['approved', 'decisionApprove'],
            ['returned', 'decisionReturn'],
          ] as const
        ).map(([decision, label]) => (
          <label key={decision} className="certification-choice">
            <input
              type="radio"
              name={id('decision')}
              value={decision}
              checked={draft.decision === decision}
              disabled={
                disabled || (decision === 'approved' && conflictDeclared)
              }
              onChange={() => onChange({ ...draft, decision })}
            />
            {copy(label)}
          </label>
        ))}
      </fieldset>
      {draft.decision === 'returned' && (
        <>
          <label htmlFor={id('reason')}>{copy('decisionReason')}</label>
          <textarea
            id={id('reason')}
            value={draft.reason}
            maxLength={CERTIFICATION_LIMITS.reason}
            disabled={disabled}
            required
            aria-invalid={invalid}
            aria-describedby={feedbackId}
            onChange={(event) =>
              onChange({ ...draft, reason: event.target.value })
            }
          />
        </>
      )}
      <ActingFieldset
        idPrefix={id('acting')}
        legend="actingTeamDecisionLegend"
        draft={draft.onBehalf}
        documents={documents}
        disabled={disabled}
        feedbackId={feedbackId}
        onChange={(onBehalf) => onChange({ ...draft, onBehalf })}
      />
      <label className="certification-choice">
        <input
          type="checkbox"
          checked={draft.independenceAttested}
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={feedbackId}
          onChange={(event) =>
            onChange({ ...draft, independenceAttested: event.target.checked })
          }
        />
        {copy('teamDecisionAttestation')}
      </label>
      <button
        type="submit"
        className={
          draft.decision === 'returned'
            ? 'certification-reject'
            : 'certification-primary'
        }
        disabled={disabled || submitBlocked}
      >
        {submitting ? copy('saving') : copy('recordDecision')}
      </button>
    </form>
  );
}
