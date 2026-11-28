import { History } from 'lucide-react';
import { useState } from 'react';
import { useCertificationCopy } from '../../certification/certification.copy';
import type { FindingPresentation } from '../../certification/CertificationFindings';
import { FindingHistoryRecords } from '../../certification/CertificationFindingViews';
import { formatMessage } from '../../localization/messages';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteEmptyState } from '../components/ClarteState';
import { ClarteSidePanel } from '../components/ClarteSidePanel';

function FindingHistory({
  finding,
  register,
}: {
  finding: Parameters<FindingPresentation['history']>[0];
  register: Parameters<FindingPresentation['history']>[1];
}) {
  const [open, setOpen] = useState(false);
  const copy = useCertificationCopy();
  const title = formatMessage(copy('findingHistory'), {
    sequence: finding.sequence,
  });
  return (
    <>
      <ClarteButton
        type="button"
        variant="quiet"
        size="small"
        onClick={() => setOpen(true)}
      >
        <History aria-hidden="true" />
        {title}
      </ClarteButton>
      {open && (
        <ClarteSidePanel
          title={title}
          onClose={() => setOpen(false)}
          icon={<History />}
        >
          <div className="clarte-finding-history">
            <FindingHistoryRecords finding={finding} register={register} />
          </div>
        </ClarteSidePanel>
      )}
    </>
  );
}

export function clarteFindingPresentation(
  reload: () => void,
): FindingPresentation {
  return {
    history: (finding, register) => (
      <FindingHistory finding={finding} register={register} />
    ),
    empty: (title) => <ClarteEmptyState title={title} />,
    form: ({ title, busy, reloadRequired, onClose, children }) => (
      <FindingCommand
        title={title}
        busy={busy}
        onClose={onClose}
        reload={reloadRequired ? reload : undefined}
      >
        {children}
      </FindingCommand>
    ),
  };
}

function FindingCommand({
  title,
  busy,
  onClose,
  reload,
  children,
}: Omit<Parameters<FindingPresentation['form']>[0], 'reloadRequired'> & {
  reload?: () => void;
}) {
  const copy = useCertificationCopy();
  return (
    <ClarteSidePanel
      title={title}
      dismissible={!busy}
      onClose={onClose}
      footer={
        reload && (
          <ClarteButton type="button" disabled={busy} onClick={reload}>
            {copy('reload')}
          </ClarteButton>
        )
      }
    >
      <div className="clarte-case-command">{children}</div>
    </ClarteSidePanel>
  );
}
