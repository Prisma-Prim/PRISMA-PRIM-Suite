import { useInterfaceLocale } from '../localization/interface-locale';
import type { ComplaintPage } from './complaints-response';
import { useComplaintCopy } from './complaints.copy';
import { Pagination } from './ComplaintIntakeViews';

export function ComplaintRegisterList({
  page,
  disabled,
  onReload,
  onPageChange,
  onOpen,
}: {
  page:
    | { status: 'loading' | 'error' | 'denied' }
    | { status: 'ready'; value: ComplaintPage };
  disabled: boolean;
  onReload: () => void;
  onPageChange: (offset: number) => void;
  onOpen: (selection: { id: string; trigger: HTMLElement }) => void;
}) {
  const copy = useComplaintCopy();
  const { formatDateTime } = useInterfaceLocale();
  return (
    <>
      {page.status === 'loading' ? (
        <p role="status">{copy('loading')}</p>
      ) : null}
      {page.status === 'error' ? (
        <div role="alert">
          <p>{copy('error')}</p>
          <button
            type="button"
            className="complaint-button complaint-button--secondary"
            onClick={onReload}
          >
            {copy('reload')}
          </button>
        </div>
      ) : null}
      {page.status === 'denied' ? <p role="alert">{copy('denied')}</p> : null}
      {page.status === 'ready' ? (
        <>
          {page.value.complaints.length === 0 ? <p>{copy('empty')}</p> : null}
          <ul className="complaint-list">
            {page.value.complaints.map((complaint) => (
              <li className="complaint-card" key={complaint.id}>
                <h3 className="complaint-literal">
                  {complaint.currentIntake.subject}
                </h3>
                <p>{complaint.clientDisplayName}</p>
                <p className="complaint-muted">
                  {copy('recordedAt')}: {formatDateTime(complaint.createdAt)}
                </p>
                <button
                  type="button"
                  className="complaint-button complaint-button--secondary"
                  onClick={(event) =>
                    onOpen({
                      id: complaint.id,
                      trigger: event.currentTarget,
                    })
                  }
                >
                  {copy('open')}
                </button>
              </li>
            ))}
          </ul>
          <Pagination
            offset={page.value.offset}
            total={page.value.total}
            disabled={disabled}
            onChange={onPageChange}
          />
        </>
      ) : null}
    </>
  );
}
