import { useId } from 'react';
import { Select } from '../presentation/Select';
import { useIntakeCopy } from './intake-copy';
import { useDossierIntake, type IntakePanelProps } from './use-dossier-intake';

const languageOptions = [
  { value: 'ro', label: 'Română' },
  { value: 'ru', label: 'Русский' },
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
];

export function DossierIntakePanel(props: IntakePanelProps) {
  return (
    <IntakeOwner
      key={JSON.stringify([props.scope, props.companyId, props.projectId])}
      {...props}
    />
  );
}
function IntakeOwner(props: IntakePanelProps) {
  const c = useIntakeCopy(),
    id = useId();
  const {
    denied,
    project,
    page,
    batch,
    selection,
    language,
    confirmed,
    busy,
    error,
    uncertainAdmission,
    refresh,
    choose,
    edit,
    register,
    run,
    phase,
    skip,
    reselect,
    changeLanguage,
    prepareAnother,
    openBatch,
    openEarlierBatch,
    confirmSelection,
    hasOriginal,
  } = useDossierIntake(props);
  if (denied) return <p role="alert">{c('error')}</p>;
  return (
    <section className="intake-panel" aria-label={c('title')}>
      <h3>{c('title')}</h3>
      <p>{c('boundary')}</p>
      {project && (
        <p>
          <strong>
            {project.title} · {project.client}
          </strong>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <button onClick={() => void refresh()}>{c('refresh')}</button>
      {!batch && (
        <fieldset disabled={busy || uncertainAdmission || !project}>
          <label htmlFor={`${id}-language`}>{c('language')}</label>
          <Select
            id={`${id}-language`}
            value={language}
            options={languageOptions}
            onValueChange={changeLanguage}
          />
          <label>
            {c('files')}
            <input
              type="file"
              multiple
              accept=".pdf,.docx"
              onChange={(event) =>
                void choose(Array.from(event.target.files ?? []))
              }
            />
          </label>
          <ol>
            {selection.map((item, index) => (
              <li key={index}>
                <strong>{item.file.fileName}</strong> · {item.file.size}
                {item.file.kind === 'invalid' ? (
                  <p>{c(item.file.reason)}</p>
                ) : (
                  <>
                    <label htmlFor={`${id}-file-${index}`}>
                      {c('language')}
                    </label>
                    <Select
                      id={`${id}-file-${index}`}
                      value={item.file.language}
                      options={languageOptions}
                      onValueChange={(value) => {
                        if (
                          value === 'ro' ||
                          value === 'ru' ||
                          value === 'fr' ||
                          value === 'en'
                        )
                          edit(index, { language: value });
                      }}
                    />
                    <label>
                      {c('metadata')}
                      <input
                        maxLength={200}
                        value={item.file.title}
                        onBlur={(event) => {
                          const value = event.target.value;
                          if (value !== value.trim())
                            edit(index, { title: value.trim() });
                        }}
                        onChange={(event) =>
                          edit(index, { title: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      {c('purpose')}
                      <input
                        maxLength={2000}
                        value={item.file.purpose}
                        onBlur={(event) => {
                          const value = event.target.value;
                          if (value !== value.trim())
                            edit(index, { purpose: value.trim() });
                        }}
                        onChange={(event) =>
                          edit(index, { purpose: event.target.value })
                        }
                      />
                    </label>
                  </>
                )}
              </li>
            ))}
          </ol>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => confirmSelection(event.target.checked)}
            />
            {c('consent')}
          </label>
          <button
            disabled={
              !confirmed ||
              selection.length === 0 ||
              selection.some(
                (item) =>
                  item.file.kind !== 'invalid' &&
                  (!item.file.title.trim() || !item.file.purpose.trim()),
              )
            }
            onClick={() => void register()}
          >
            {c('register')}
          </button>
        </fieldset>
      )}
      {uncertainAdmission && (
        <button disabled={busy} onClick={() => void register()}>
          {c('retryAdmission')}
        </button>
      )}
      {batch && (
        <>
          <p role="status">
            {c(batch.phase)} ·{' '}
            {
              batch.items.filter(
                (item) =>
                  item.kind === 'file' && item.progress.stage === 'complete',
              ).length
            }
            /{batch.items.length}
          </p>
          <div className="intake-actions">
            <button
              disabled={busy || batch.phase === 'completed'}
              onClick={() => void run()}
            >
              {c('resume')}
            </button>
            <button
              disabled={batch.phase === 'completed'}
              onClick={() => void phase('pause')}
            >
              {c('pause')}
            </button>
            <button
              disabled={batch.phase === 'completed'}
              onClick={() => void phase('stop')}
            >
              {c('stop')}
            </button>
          </div>
          <ol>
            {batch.items.map((item) => (
              <li key={item.id} data-intake-item={item.id}>
                <strong>{item.file.fileName}</strong> · {item.file.size}
                {item.kind === 'invalid' ? (
                  <p>{c(item.file.reason)}</p>
                ) : (
                  <>
                    <p>{c(item.progress.stage)}</p>
                    {item.progress.duplicateBatchId && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          const earlier = item.progress.duplicateBatchId;
                          if (earlier) void openEarlierBatch(earlier);
                        }}
                      >
                        {c('previousBatch')}
                      </button>
                    )}
                    {item.failure && (
                      <p>
                        {c('failed')} ({item.failures}) · {c(item.failure)}
                      </p>
                    )}
                    {item.outcome === 'pending' && <p>{c('pending')}</p>}
                    <p>
                      {c('metadata')}: {item.file.title} · {item.file.language}
                    </p>
                    {item.progress.stage === 'linked' && (
                      <>
                        <p>
                          {c(
                            hasOriginal(item.file.sha256) ? 'ready' : 'waiting',
                          )}
                        </p>
                        <label>
                          {c('reselect')}
                          <input
                            disabled={busy}
                            type="file"
                            accept={`.${item.file.kind}`}
                            onChange={(event) =>
                              void reselect(item.id, event.target.files?.[0])
                            }
                          />
                        </label>
                      </>
                    )}
                    {(item.progress.stage === 'duplicate' ||
                      (item.outcome === 'failed' &&
                        !['skipped', 'complete'].includes(
                          item.progress.stage,
                        ))) && (
                      <button
                        disabled={busy}
                        onClick={() => void skip(item.id)}
                      >
                        {c('skip')}
                      </button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ol>
          <button disabled={busy} onClick={prepareAnother}>
            {c('newBatch')}
          </button>
        </>
      )}
      <ul>
        {page.items.map((item) => (
          <li key={item.id}>
            <button disabled={busy} onClick={() => openBatch(item)}>
              {c('reopen')} · {item.createdAt} · {c(item.phase)}
            </button>
          </li>
        ))}
      </ul>
      {page.nextBefore && (
        <button disabled={busy} onClick={() => void refresh(page.nextBefore)}>
          {c('older')}
        </button>
      )}
    </section>
  );
}
