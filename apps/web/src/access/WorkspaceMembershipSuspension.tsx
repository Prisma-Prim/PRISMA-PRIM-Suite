import { Select } from '../presentation/Select';
import {
  useMembershipSuspension,
  type MembershipSuspensionOptions,
} from './use-membership-suspension';
import { useWorkspaceMembershipSuspensionCopy } from './workspace-membership-suspension.copy';

export type { SuspensionMemberOption } from './use-membership-suspension';

export function WorkspaceMembershipSuspension(
  props: MembershipSuspensionOptions,
) {
  const copy = useWorkspaceMembershipSuspensionCopy();
  const suspension = useMembershipSuspension(props);
  const { members, disabled } = props;
  const { workspaceMembershipId, selectedMember, state, pending } = suspension;

  if (!suspension.allowed) return null;
  return (
    <section
      aria-labelledby="workspace-access-suspension-title"
      className="membership-suspension membership-suspension--prisme"
    >
      <h3 id="workspace-access-suspension-title">{copy.title}</h3>
      <p>{copy.description}</p>
      {members.length === 0 ? (
        <p>{copy.empty}</p>
      ) : (
        <>
          <label htmlFor="workspace-access-suspension-member">
            {copy.memberLabel}
          </label>
          <Select
            id="workspace-access-suspension-member"
            value={workspaceMembershipId}
            disabled={disabled || pending}
            placeholder={copy.selectMember}
            options={members.map((member) => ({
              value: member.workspaceMembershipId,
              label: member.label,
            }))}
            onValueChange={suspension.select}
          />
          <button
            type="button"
            className="company-access-secondary-action"
            disabled={disabled || pending || !workspaceMembershipId}
            onClick={() => suspension.review(workspaceMembershipId)}
          >
            {copy.review}
          </button>
        </>
      )}
      {state.status === 'reviewing' && selectedMember && (
        <div
          role="region"
          aria-label={copy.confirmationRegionLabel}
          className="membership-suspension-confirmation"
        >
          <p>
            {copy.selectedMemberLabel}: <strong>{selectedMember.label}</strong>
          </p>
          <p>{copy.confirmation}</p>
          <button
            type="button"
            className="company-access-secondary-action"
            onClick={suspension.reset}
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            className="membership-suspension-confirm"
            onClick={() => void suspension.submit()}
          >
            {copy.confirm}
          </button>
        </div>
      )}
      {pending && <p role="status">{copy.submitting}</p>}
      {state.status === 'ready' && <p role="status">{copy.suspended}</p>}
      {state.status === 'error' && <p role="alert">{copy.error}</p>}
    </section>
  );
}
