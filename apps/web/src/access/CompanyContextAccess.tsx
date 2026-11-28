import { type FormEvent, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { Select } from '../presentation/Select';
import { formatMessage } from '../localization/messages';
import {
  bundleLabel,
  disambiguatedLabel,
  duplicatedLabels,
  memberLabel,
  type AssignmentBundle,
} from './assignment-bundles';
import { useAssignmentBundleCatalogue } from './assignment-bundle-catalogue';
import { useCompanyAssignmentCopy } from './company-assignment-localization.copy';
import {
  useCompanyAccessAdministration,
  type AccessSubmission,
  type CompanyAccessAdministrationCallbacks,
} from './use-company-access-administration';
import { WorkspaceSessionRevocations } from './WorkspaceSessionRevocations';
import { WorkspaceMembershipSuspension } from './WorkspaceMembershipSuspension';
import './access-administration.css';

export function CompanyContextAccess({
  actor,
  identity,
  onActivityRecorded = () => undefined,
  onWorkspaceAccessRejected = () => undefined,
  ...callbacks
}: CompanyAccessAdministrationCallbacks & {
  actor: ActorContext;
  identity: BrowserIdentity;
}) {
  const copy = useCompanyAssignmentCopy();
  const catalogue = useAssignmentBundleCatalogue();
  const [bundle, setBundle] = useState<AssignmentBundle>('company-context');
  const access = useCompanyAccessAdministration({
    actor,
    identity,
    onActivityRecorded,
    onWorkspaceAccessRejected,
    ...callbacks,
  });
  const {
    administration,
    mutation,
    workspaceMembershipId,
    companyId,
    suspensionPending,
  } = access;
  if (!access.allowed) return null;

  async function submit(event: FormEvent, submission: AccessSubmission) {
    event.preventDefault();
    await access.submit(submission, bundle);
  }

  if (administration.status === 'loading') {
    return (
      <section
        aria-labelledby="company-context-access-title"
        className="company-access company-access--prisme"
      >
        <p className="eyebrow">{copy('eyebrow')}</p>
        <h2 id="company-context-access-title">{copy('title')}</h2>
        <p role="status">{copy('loading')}</p>
      </section>
    );
  }

  if (administration.status === 'error') {
    return (
      <section
        aria-labelledby="company-context-access-title"
        className="company-access company-access--prisme"
      >
        <p className="eyebrow">{copy('eyebrow')}</p>
        <h2 id="company-context-access-title">{copy('title')}</h2>
        <p role="alert">{copy('error')}</p>
        <button
          type="button"
          className="company-access-primary-action"
          onClick={() => void access.retryAdministration()}
        >
          {copy('retry')}
        </button>
      </section>
    );
  }

  const data = administration.value;
  const duplicateMemberLabels = duplicatedLabels(data.members.map(memberLabel));
  const duplicateCompanyLabels = duplicatedLabels(
    data.companies.map((company) => company.displayName),
  );
  const selectedBundleLabel = bundleLabel(bundle);
  const selectedAssignment = data.assignments.find(
    (assignment) =>
      assignment.active &&
      assignment.workspaceMembershipId === workspaceMembershipId &&
      assignment.companyId === companyId &&
      assignment.bundle === selectedBundleLabel,
  );
  const activeAssignment = selectedAssignment !== undefined;
  const capturedVersion = selectedAssignment?.permissionSetVersion ?? null;
  const hasSelectableTargets =
    data.members.length > 0 && data.companies.length > 0;
  const pending = mutation.status === 'submitting';
  const busy = pending || suspensionPending;
  const unresolved =
    mutation.status === 'error' || mutation.status === 'unrefreshed';
  const retrySubmission = access.retrySubmission(bundle);
  const prerequisites = catalogue.find(
    (option) => option.bundle === bundle,
  )?.prerequisites;

  return (
    <section
      aria-labelledby="company-context-access-title"
      className="company-access company-access--prisme"
    >
      <p className="eyebrow">{copy('eyebrow')}</p>
      <h2 id="company-context-access-title">{copy('title')}</h2>
      <p>{copy('description')}</p>
      {!hasSelectableTargets && <p>{copy('empty')}</p>}
      {hasSelectableTargets && (
        <form
          className="company-access-form"
          noValidate
          onSubmit={(event) => void submit(event, 'grant')}
        >
          <label htmlFor="context-access-member">
            {copy('workspaceMemberLabel')}
          </label>
          <Select
            id="context-access-member"
            value={workspaceMembershipId}
            disabled={busy}
            placeholder={copy('selectMember')}
            options={data.members.map((member) => ({
              value: member.workspaceMembershipId,
              label: disambiguatedLabel({
                label: memberLabel(member),
                id: member.workspaceMembershipId,
                duplicates: duplicateMemberLabels,
                referenceLabel: copy('referenceLabel'),
              }),
            }))}
            onValueChange={access.selectMember}
          />

          <label htmlFor="context-access-company">{copy('companyLabel')}</label>
          <Select
            id="context-access-company"
            value={companyId}
            disabled={busy}
            placeholder={copy('selectCompany')}
            options={data.companies.map((company) => ({
              value: company.id,
              label: disambiguatedLabel({
                label: company.displayName,
                id: company.id,
                duplicates: duplicateCompanyLabels,
                referenceLabel: copy('referenceLabel'),
              }),
            }))}
            onValueChange={access.selectCompany}
          />

          <label htmlFor="context-access-bundle">{copy('bundleLabel')}</label>
          <Select
            id="context-access-bundle"
            value={bundle}
            disabled={busy}
            options={catalogue.map((option) => ({
              value: option.bundle,
              label: option.label,
            }))}
            onValueChange={(value) => {
              access.resetCommand();
              const chosen = catalogue.find(
                (option) => option.bundle === value,
              );
              if (chosen) setBundle(chosen.bundle);
            }}
          />

          {prerequisites !== undefined && <p>{prerequisites}</p>}
          {workspaceMembershipId && companyId && (
            <p role="status">
              {copy('currentStateLabel')}:{' '}
              <strong>
                {!activeAssignment
                  ? copy('currentStateNotGranted')
                  : capturedVersion === null
                    ? copy('currentStateGranted')
                    : formatMessage(copy('currentStateGrantedVersion'), {
                        version: capturedVersion,
                      })}
              </strong>
            </p>
          )}
          {capturedVersion !== null && (
            <p>{copy('capturedVersionExplanation')}</p>
          )}

          <button
            type="submit"
            className="company-access-primary-action"
            disabled={
              busy ||
              !workspaceMembershipId ||
              !companyId ||
              (activeAssignment && retrySubmission !== 'grant')
            }
          >
            {copy('grant')}
          </button>
          <button
            type="button"
            className="company-access-secondary-action"
            disabled={
              busy ||
              !workspaceMembershipId ||
              !companyId ||
              (!activeAssignment && retrySubmission !== 'revoke')
            }
            onClick={(event) => void submit(event, 'revoke')}
          >
            {copy('revoke')}
          </button>
        </form>
      )}
      {mutation.status === 'ready' && (
        <p role="status">
          {mutation.submission === 'grant' ? copy('granted') : copy('revoked')}
        </p>
      )}
      {unresolved && <p role="alert">{copy('error')}</p>}
      <WorkspaceSessionRevocations
        actor={actor}
        identity={identity}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
        onActivityRecorded={onActivityRecorded}
      />
      <WorkspaceMembershipSuspension
        actor={actor}
        identity={identity}
        members={data.members.map((member) => ({
          workspaceMembershipId: member.workspaceMembershipId,
          label: disambiguatedLabel({
            label: memberLabel(member),
            id: member.workspaceMembershipId,
            duplicates: duplicateMemberLabels,
            referenceLabel: copy('referenceLabel'),
          }),
        }))}
        disabled={pending}
        reloadAdministration={access.reloadAdministration}
        onPendingChange={access.setSuspensionPending}
        onActivityRecorded={onActivityRecorded}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />
    </section>
  );
}
