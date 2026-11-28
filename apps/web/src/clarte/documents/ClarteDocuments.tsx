import { FilePlus2, FileText, FolderKanban, Search } from 'lucide-react';
import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { holds } from '../../access/company-grants';
import { DocumentCorrectionHistory } from '../../documents/DocumentCorrectionHistory';
import { DocumentVersions } from '../../documents/DocumentVersions';
import {
  documentSessionKey,
  useDocumentSession,
  type DocumentWorkspaceProps,
} from '../../documents/DocumentWorkspace';
import type { DocumentProjectAssociation } from '../../documents/document-response';
import { documentNativeAuthority } from '../../documents/document-native-authority';
import {
  WORKSPACE_FAMILIES,
  documentHas,
  familyScreen,
  isWorkspaceFamily,
  type WorkspaceFamily,
} from '../../documents/document-family-registry';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { formatApplicationDateTime } from '../../presentation/date-time';
import { Select } from '../../presentation/Select';
import { ClarteBadge } from '../components/ClarteBadge';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteCard } from '../components/ClarteCard';
import { ClarteField } from '../components/ClarteField';
import { ClarteSidePanel } from '../components/ClarteSidePanel';
import {
  ClarteEmptyState,
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import { ClarteProjectDocuments } from './ClarteProjectDocuments';
import { useClarteDocumentsCopy } from './clarte-documents.copy';
import './clarte-documents.css';

type Session = ReturnType<typeof useDocumentSession>;

/**
 * The Clarté Documents register (#1543): working Documents listed and
 * filtered, one side panel per Document with its details, Versions, PDFs,
 * received relations and corrections, a registration panel and a Project
 * panel. It renders the same Document session as the current interface, so
 * every read, draft, hold and command keeps its single owner.
 */
export function ClarteDocumentWorkspace(props: DocumentWorkspaceProps) {
  return <ClarteDocumentSession key={documentSessionKey(props)} {...props} />;
}

function ClarteDocumentSession(props: DocumentWorkspaceProps) {
  const { actor, identity, onSelectPaymentEvidence, onActivityRecorded } =
    props;
  const session = useDocumentSession(props);
  const {
    copy,
    familyCopies,
    paymentCopy,
    state,
    filter,
    setFilter,
    detail,
    setDetail,
    mutation,
    receivedBusy,
    hostProtected,
    canRegister,
    visibleDocuments,
    filteredDocuments,
    restrictionAwaitsRead,
    restrictionReadFailed,
    open,
    retryListRead,
  } = session;
  const clarte = useClarteDocumentsCopy();
  const { locale } = useInterfaceLocale();
  const relativeTime = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const now = Date.now();
  const [registering, setRegistering] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [typeFilter, setTypeFilter] = useState<WorkspaceFamily>();
  // A Document opened by a confirmed registration or a request replaces the form.
  useEffect(() => {
    if (detail) setRegistering(false);
  }, [detail]);
  const company = actor.activeCompany;
  const canOrganizeByProject =
    holds(company, 'company_project_access', 'project.read') &&
    holds(company, 'company_document_registrar', 'document.read');
  // A revoked Project read retires the panel with its reads and Project names.
  useEffect(() => {
    if (!canOrganizeByProject) setOrganizing(false);
  }, [canOrganizeByProject]);
  const rowsBusy = mutation === 'pending' || receivedBusy;
  const familiesPresent = WORKSPACE_FAMILIES.filter((type) =>
    visibleDocuments.some((document) => document.type === type),
  );
  const shownType =
    typeFilter && familiesPresent.includes(typeFilter) ? typeFilter : undefined;
  const rows = shownType
    ? filteredDocuments.filter((document) => document.type === shownType)
    : filteredDocuments;
  const showRegistration = registering && !detail && state.status === 'ready';
  const feedback = (
    <>
      {(mutation === 'error' || restrictionReadFailed) && (
        <p className="clarte-documents-feedback" role="alert">
          {copy.error}
        </p>
      )}
      {mutation === 'registered' && (
        <p className="clarte-documents-feedback" role="status">
          {copy.registered}
        </p>
      )}
    </>
  );

  return (
    <section
      id="documents"
      tabIndex={-1}
      className="clarte-documents"
      aria-label={copy.title}
    >
      <div className="clarte-documents-toolbar">
        <div className="clarte-documents-actions">
          {onSelectPaymentEvidence && (
            <ClarteButton
              disabled={hostProtected}
              onClick={() => onSelectPaymentEvidence()}
            >
              {paymentCopy('title')}
            </ClarteButton>
          )}
          {canOrganizeByProject && state.status === 'ready' && (
            <ClarteButton
              disabled={rowsBusy}
              onClick={() => setOrganizing(true)}
            >
              <FolderKanban aria-hidden="true" />
              {clarte.projectsAction}
            </ClarteButton>
          )}
          {canRegister && state.status === 'ready' && (
            <ClarteButton
              variant="primary"
              disabled={rowsBusy}
              onClick={() => setRegistering(true)}
            >
              <FilePlus2 aria-hidden="true" />
              {clarte.registerAction}
            </ClarteButton>
          )}
        </div>
      </div>
      {state.status === 'loading' && (
        <ClarteLoadingState label={copy.loading} />
      )}
      {state.status === 'denied' && <ClarteErrorState title={copy.denied} />}
      {state.status === 'error' && (
        <ClarteErrorState
          title={copy.error}
          action={
            <ClarteButton onClick={retryListRead}>{copy.retry}</ClarteButton>
          }
        />
      )}
      {state.status === 'ready' && (
        <div className="clarte-documents-layout">
          {familiesPresent.length > 1 && (
            <nav
              className="clarte-documents-facets"
              aria-label={clarte.typeFilter}
            >
              <p className="clarte-documents-facets-title" aria-hidden="true">
                {clarte.typeFilter}
              </p>
              <ul>
                <TypeFacet
                  label={clarte.allTypes}
                  count={visibleDocuments.length}
                  pressed={shownType === undefined}
                  onChoose={() => setTypeFilter(undefined)}
                />
                {familiesPresent.map((type) => (
                  <TypeFacet
                    key={type}
                    label={familyScreen(type).label(familyCopies)}
                    count={
                      visibleDocuments.filter(
                        (document) => document.type === type,
                      ).length
                    }
                    pressed={shownType === type}
                    onChoose={() => setTypeFilter(type)}
                  />
                ))}
              </ul>
            </nav>
          )}
          <ClarteCard>
            {visibleDocuments.length > 0 && (
              <div className="clarte-documents-search">
                <Search aria-hidden="true" />
                <ClarteField label={copy.filterLabel} labelHidden>
                  {(control) => (
                    <input
                      {...control}
                      className="clarte-input"
                      type="search"
                      disabled={receivedBusy}
                      value={
                        filter.kind === 'client'
                          ? filter.displayName
                          : filter.query
                      }
                      placeholder={copy.filterPlaceholder}
                      onChange={(event) =>
                        setFilter({ kind: 'text', query: event.target.value })
                      }
                    />
                  )}
                </ClarteField>
              </div>
            )}
            {restrictionReadFailed ? (
              <ClarteButton onClick={retryListRead}>{copy.retry}</ClarteButton>
            ) : restrictionAwaitsRead ? (
              <ClarteLoadingState label={copy.loading} />
            ) : (
              visibleDocuments.length > 0 &&
              rows.length === 0 && (
                <p className="clarte-documents-note" role="status">
                  {copy.noMatches}
                </p>
              )
            )}
            {visibleDocuments.length === 0 && !restrictionAwaitsRead && (
              <ClarteEmptyState title={copy.empty} />
            )}
            {rows.length > 0 && (
              <ul className="clarte-document-rows" aria-label={copy.title}>
                {rows.map((document) => (
                  <li key={document.id}>
                    <span className="clarte-document-icon" aria-hidden="true">
                      <FileText />
                    </span>
                    <div className="clarte-document-row-main">
                      <button
                        type="button"
                        className="clarte-document-open"
                        disabled={rowsBusy}
                        onClick={() => void open(document.id)}
                      >
                        {document.title}
                      </button>
                      <p className="clarte-document-row-meta">
                        <span>
                          {familyScreen(document.type).label(familyCopies)}
                        </span>
                        <span>{document.clientDisplayName}</span>
                        {documentHas(document, 'showsRegistrationTime') && (
                          <time
                            dateTime={document.createdAt}
                            title={formatApplicationDateTime(
                              document.createdAt,
                            )}
                          >
                            {formatRecordedAge(
                              document.createdAt,
                              now,
                              relativeTime,
                            )}
                          </time>
                        )}
                      </p>
                    </div>
                    <ClarteBadge
                      tone={
                        document.version.status === 'official'
                          ? 'success'
                          : 'neutral'
                      }
                    >
                      {clarte.versionStatus(document.version.status)}
                    </ClarteBadge>
                  </li>
                ))}
              </ul>
            )}
          </ClarteCard>
        </div>
      )}
      {!showRegistration && feedback}
      {showRegistration && (
        <RegistrationPanel
          actor={actor}
          session={session}
          feedback={feedback}
          onClose={() => setRegistering(false)}
        />
      )}
      {organizing &&
        canOrganizeByProject &&
        state.status === 'ready' &&
        !detail && (
          <ClarteProjectDocuments
            actor={actor}
            identity={identity}
            onActivityRecorded={onActivityRecorded}
            onOpenDocument={(documentId) => {
              setOrganizing(false);
              void open(documentId);
            }}
            onClose={() => setOrganizing(false)}
          />
        )}
      {/* A denied or failed refresh withdraws the Document with the rows. */}
      {detail && state.status === 'ready' && (
        <DocumentPanel
          key={detail.id}
          props={props}
          session={session}
          onClose={() => setDetail(undefined)}
        />
      )}
    </section>
  );
}

function formatRecordedAge(
  createdAt: string,
  now: number,
  format: Intl.RelativeTimeFormat,
) {
  const minutes = Math.trunc((Date.parse(createdAt) - now) / 60_000);
  if (minutes === 0) return format.format(0, 'second');
  if (Math.abs(minutes) < 60) return format.format(minutes, 'minute');
  const hours = Math.trunc(minutes / 60);
  if (Math.abs(hours) < 24) return format.format(hours, 'hour');
  return format.format(Math.trunc(hours / 24), 'day');
}

function TypeFacet({
  label,
  count,
  pressed,
  onChoose,
}: Readonly<{
  label: string;
  count: number;
  pressed: boolean;
  onChoose: () => void;
}>) {
  const clarte = useClarteDocumentsCopy();
  return (
    <li>
      <button
        type="button"
        aria-pressed={pressed}
        aria-label={clarte.typeCount(label, count)}
        onClick={onChoose}
      >
        <span>{label}</span>
        <em>{count}</em>
      </button>
    </li>
  );
}

/** The registration form of the chosen family, in its own side panel. */
function RegistrationPanel({
  actor,
  session,
  feedback,
  onClose,
}: Readonly<{
  actor: DocumentWorkspaceProps['actor'];
  session: Session;
  feedback: ReactNode;
  onClose: () => void;
}>) {
  const {
    copy,
    familyCopies,
    state,
    family,
    setFamily,
    clientId,
    setClientId,
    title,
    setTitle,
    purpose,
    setPurpose,
    url,
    setUrl,
    mutation,
    receivedBusy,
    companyId,
    familyAuthority,
    familyCaptures,
    registrationSource,
    submit,
    sourceRegistration,
  } = session;
  const clarte = useClarteDocumentsCopy();
  const busy = mutation === 'pending' || receivedBusy;
  return (
    <ClarteSidePanel
      title={clarte.registerAction}
      icon={<FilePlus2 />}
      description={familyScreen(family).warning(familyCopies) ?? copy.warning}
      dismissible={!busy}
      onClose={onClose}
    >
      <div className="clarte-document-stack">
        {familyAuthority.offersFamilyChoice && (
          <ClarteField label={familyCopies.mission.t('family')}>
            {(control) => (
              <Select
                id={control.id}
                describedBy={control['aria-describedby']}
                value={family}
                disabled={busy}
                options={WORKSPACE_FAMILIES.filter((type) =>
                  familyAuthority.selectable(type),
                ).map((type) => ({
                  value: type,
                  label: familyScreen(type).label(familyCopies),
                }))}
                onValueChange={(value) => {
                  if (!receivedBusy && isWorkspaceFamily(value))
                    setFamily(value);
                }}
              />
            )}
          </ClarteField>
        )}
        {registrationSource ? (
          familyAuthority.sourceSelectable(family) && companyId ? (
            <div className="clarte-document-legacy">
              <Fragment
                key={JSON.stringify([
                  familyCaptures[family],
                  registrationSource.authority(actor),
                ])}
              >
                {registrationSource.render(sourceRegistration(companyId))}
              </Fragment>
            </div>
          ) : (
            <p>{registrationSource.denied(familyCopies)}</p>
          )
        ) : (
          <form
            className="clarte-document-stack"
            onSubmit={(event) => void submit(event)}
          >
            <ClarteField label={copy.client}>
              {(control) => (
                <Select
                  id={control.id}
                  describedBy={control['aria-describedby']}
                  required
                  value={clientId}
                  placeholder={copy.selectClient}
                  options={
                    state.status === 'ready'
                      ? state.clients.map((client) => ({
                          value: client.id,
                          label: client.displayName,
                        }))
                      : []
                  }
                  onValueChange={setClientId}
                />
              )}
            </ClarteField>
            <ClarteField label={copy.titleLabel}>
              {(control) => (
                <input
                  {...control}
                  className="clarte-input"
                  required
                  maxLength={200}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              )}
            </ClarteField>
            <ClarteField label={copy.purpose}>
              {(control) => (
                <textarea
                  {...control}
                  className="clarte-input"
                  required
                  maxLength={2000}
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                />
              )}
            </ClarteField>
            {familyScreen(family).referenceUrl && (
              <ClarteField label={copy.url}>
                {(control) => (
                  <input
                    {...control}
                    className="clarte-input"
                    required
                    type="url"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                  />
                )}
              </ClarteField>
            )}
            <div className="clarte-document-actions">
              <ClarteButton type="submit" variant="primary" disabled={busy}>
                {copy.register}
              </ClarteButton>
            </div>
          </form>
        )}
        {feedback}
      </div>
    </ClarteSidePanel>
  );
}

/** One Document's side panel: details, correction, Versions and history. */
function DocumentPanel({
  props,
  session,
  onClose,
}: Readonly<{
  props: DocumentWorkspaceProps;
  session: Session;
  onClose: () => void;
}>) {
  const {
    actor,
    identity,
    onOpenClientDossier,
    onOpenProject,
    onCompanyContextRejected,
    onActorRevalidated,
    onWorkspaceAccessRejected,
  } = props;
  const {
    copy,
    familyCopies,
    detail,
    detailHeading,
    editing,
    correction,
    title,
    setTitle,
    purpose,
    setPurpose,
    url,
    setUrl,
    staleDossier,
    heldRequest,
    protectedWorkActive,
    versionWorkProtected,
    setVersionWorkProtected,
    canCorrect,
    canReadProjects,
    familyAuthority,
    DetailRelation,
    open,
    submitCorrection,
    beginCorrection,
    cancelCorrection,
    refreshAfterVersionWork,
  } = session;
  const clarte = useClarteDocumentsCopy();
  const versionListId = useId();
  const [versionView, setVersionView] = useState<
    'summary' | 'details' | 'references'
  >('summary');
  const [choosingProject, setChoosingProject] = useState(false);
  const detailsPart = useRef<HTMLDivElement>(null);
  const versionsPart = useRef<HTMLDivElement>(null);
  const correctionsPart = useRef<HTMLDivElement>(null);
  const canManageProjectAssociation =
    canReadProjects &&
    holds(
      actor.activeCompany,
      'company_document_project_organizer',
      'document.project.manage',
    );
  useEffect(() => {
    if (!canManageProjectAssociation) setChoosingProject(false);
  }, [canManageProjectAssociation]);
  if (!detail) return null;
  const screen = familyScreen(detail.type);
  const correctionLocked =
    correction === 'pending' || correction === 'uncertain';
  const reference = detail.version.representation;
  const showProjectPicker = choosingProject && canManageProjectAssociation;
  const hasVersions = Boolean(documentNativeAuthority(actor, detail.type));
  const hasVersionReferences = hasVersions && detail.type === 'questionnaire';
  const frozenReferenceStyle: CSSProperties & { '--frozen-reference': string } =
    {
      '--frozen-reference': JSON.stringify(clarte.frozenReference),
    };
  const documentPanel = (
    <ClarteSidePanel
      title={detail.title}
      description={screen.status(familyCopies, detail.version.status)}
      titleRef={detailHeading}
      icon={<FileText />}
      open={!showProjectPicker}
      dismissible={!protectedWorkActive}
      onClose={onClose}
    >
      <nav className="clarte-document-parts" aria-label={clarte.sections}>
        <PartLink part={detailsPart} label={clarte.details} />
        <PartLink
          part={versionsPart}
          label={clarte.versions}
          onActivate={() => {
            if (!versionWorkProtected && versionView === 'references')
              setVersionView('summary');
          }}
        />
        {hasVersionReferences && (
          <PartLink
            part={versionsPart}
            label={clarte.references}
            disabled={versionWorkProtected && versionView !== 'references'}
            onActivate={() => setVersionView('references')}
          />
        )}
        <PartLink part={correctionsPart} label={clarte.corrections} />
      </nav>
      <div className="clarte-document-stack" ref={detailsPart}>
        <p className="clarte-documents-note">
          {screen.warning(familyCopies) ??
            (detail.version.status === 'official'
              ? copy.officialWarning
              : copy.warning)}
        </p>
        {editing ? (
          <form
            className="clarte-document-stack"
            aria-label={copy.edit}
            onSubmit={(event) => void submitCorrection(event)}
          >
            <ClarteField label={copy.titleLabel}>
              {(control) => (
                <input
                  {...control}
                  className="clarte-input"
                  required
                  maxLength={200}
                  disabled={correctionLocked}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              )}
            </ClarteField>
            <ClarteField label={copy.purpose}>
              {(control) => (
                <textarea
                  {...control}
                  className="clarte-input"
                  required
                  maxLength={2000}
                  disabled={correctionLocked}
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                />
              )}
            </ClarteField>
            {screen.referenceUrl && (
              <ClarteField label={copy.url}>
                {(control) => (
                  <input
                    {...control}
                    className="clarte-input"
                    required
                    type="url"
                    disabled={correctionLocked}
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                  />
                )}
              </ClarteField>
            )}
            <div className="clarte-document-actions">
              <ClarteButton
                type="submit"
                variant="primary"
                disabled={correctionLocked}
              >
                {copy.save}
              </ClarteButton>
              <ClarteButton
                disabled={correction === 'pending'}
                onClick={cancelCorrection}
              >
                {copy.cancel}
              </ClarteButton>
            </div>
          </form>
        ) : (
          <section
            className="clarte-document-facts"
            aria-label={clarte.details}
          >
            <dl>
              <Fact term={clarte.type}>{screen.label(familyCopies)}</Fact>
              <Fact term={copy.client}>
                <span>{detail.clientDisplayName}</span>
                {detail.clientDossierId &&
                  onOpenClientDossier &&
                  staleDossier?.documentId !== detail.id && (
                    <ClarteButton
                      size="small"
                      variant="quiet"
                      onClick={() => {
                        if (detail.clientDossierId)
                          onOpenClientDossier(detail.clientDossierId);
                      }}
                    >
                      {copy.openDossier}
                    </ClarteButton>
                  )}
              </Fact>
              <Fact term={copy.purpose}>{detail.purpose}</Fact>
              {documentHas(detail, 'showsRegistrationTime') && (
                <Fact term={copy.registrationTime}>
                  <time dateTime={detail.createdAt}>
                    {formatApplicationDateTime(detail.createdAt)}
                  </time>
                </Fact>
              )}
              {documentHas(detail, 'projectLinkable') &&
                canReadProjects &&
                detail.projectAssociation && (
                  <Fact term={copy.project}>
                    <span>
                      {projectAssociationLabel(
                        detail.projectAssociation,
                        copy.notLinkedToProject,
                      )}
                    </span>
                    {detail.projectAssociation.state === 'unlinked' &&
                      detail.type !== 'project-source' &&
                      canManageProjectAssociation && (
                        <ClarteButton
                          size="small"
                          variant="quiet"
                          disabled={protectedWorkActive}
                          onClick={() => setChoosingProject(true)}
                        >
                          {clarte.associateProject}
                        </ClarteButton>
                      )}
                    {detail.projectAssociation.state === 'linked' &&
                      onOpenProject && (
                        <ClarteButton
                          size="small"
                          variant="quiet"
                          onClick={() => {
                            if (detail.projectAssociation?.state === 'linked')
                              onOpenProject(
                                detail.projectAssociation.project.id,
                              );
                          }}
                        >
                          {copy.openProject}
                        </ClarteButton>
                      )}
                  </Fact>
                )}
              {reference?.access === 'granted' ? (
                <Fact term={clarte.externalReference}>
                  <a
                    href={reference.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {copy.open}
                  </a>
                </Fact>
              ) : screen.referenceUrl ? (
                <Fact term={clarte.externalReference}>
                  {copy.referenceDenied}
                </Fact>
              ) : null}
            </dl>
            {canCorrect &&
              familyAuthority.manageable(detail.type) &&
              correction !== 'conflict' &&
              detail.correction === 'allowed' &&
              (!documentHas(detail, 'referenceUrl') ||
                detail.version.representation.access === 'granted') && (
                <div className="clarte-document-actions">
                  <ClarteButton onClick={beginCorrection}>
                    {copy.edit}
                  </ClarteButton>
                </div>
              )}
          </section>
        )}
        {correction === 'pending' && <p role="status">{copy.saving}</p>}
        {(correction === 'saved' || correction === 'saved-refresh-failed') && (
          <p role="status">{copy.saved}</p>
        )}
        {(correction === 'unchanged' ||
          correction === 'unchanged-refresh-failed') && (
          <p role="status">{copy.unchanged}</p>
        )}
        {(correction === 'saved-refresh-failed' ||
          correction === 'unchanged-refresh-failed') && (
          <ClarteErrorState
            title={copy.confirmedRefreshFailed}
            action={
              <ClarteButton onClick={() => void open(detail.id)}>
                {copy.reload}
              </ClarteButton>
            }
          />
        )}
        {correction === 'denied' && (
          <ClarteErrorState title={copy.correctionDenied} />
        )}
        {correction === 'conflict' && (
          <ClarteErrorState
            title={copy.conflict}
            action={
              <ClarteButton onClick={() => void open(detail.id)}>
                {copy.reload}
              </ClarteButton>
            }
          />
        )}
        {correction === 'uncertain' && (
          <ClarteErrorState
            title={copy.uncertain}
            action={
              <ClarteButton
                onClick={(event) => void submitCorrection(event, true)}
              >
                {copy.retryCorrection}
              </ClarteButton>
            }
          />
        )}
        {heldRequest && protectedWorkActive && (
          <p role="status">
            {versionWorkProtected
              ? copy.requestedDocumentWorkHeld
              : copy.requestedDocumentHeld}
          </p>
        )}
        <div className="clarte-document-legacy">
          {DetailRelation && (
            <DetailRelation
              key={familyAuthority.ownerKey('relation', detail.type)}
              actor={actor}
              identity={identity}
              documentId={detail.id}
              onActorRevalidated={onActorRevalidated}
              onCompanyContextRejected={onCompanyContextRejected}
              onWorkspaceAccessRejected={onWorkspaceAccessRejected}
            />
          )}
          <div
            ref={versionsPart}
            className="clarte-document-version-panel"
            data-view={versionView}
            style={frozenReferenceStyle}
          >
            {hasVersions &&
              (versionView === 'references' ? (
                <h3>{clarte.references}</h3>
              ) : (
                <ClarteButton
                  variant="quiet"
                  size="small"
                  aria-expanded={versionView === 'details'}
                  aria-controls={versionListId}
                  disabled={versionWorkProtected}
                  onClick={() =>
                    setVersionView(
                      versionView === 'details' ? 'summary' : 'details',
                    )
                  }
                >
                  {versionView === 'details'
                    ? clarte.hideVersionDetails
                    : clarte.showVersionDetails}
                </ClarteButton>
              ))}
            <div id={versionListId}>
              <DocumentVersions
                key={familyAuthority.ownerKey('versions', detail.type)}
                actor={actor}
                identity={identity}
                documentId={detail.id}
                documentType={detail.type}
                workingRevision={detail.workingRevision}
                onProtectedWorkChange={setVersionWorkProtected}
                onRefresh={() => refreshAfterVersionWork(detail.id)}
                onCompanyContextRejected={onCompanyContextRejected}
                onActorRevalidated={onActorRevalidated}
                onWorkspaceAccessRejected={onWorkspaceAccessRejected}
              />
            </div>
          </div>
          <div ref={correctionsPart} className="clarte-document-corrections">
            <DocumentCorrectionHistory
              key={familyAuthority.ownerKey('corrections', detail.type)}
              actor={actor}
              identity={identity}
              documentId={detail.id}
              documentType={detail.type}
              workingRevision={detail.workingRevision}
            />
          </div>
        </div>
      </div>
    </ClarteSidePanel>
  );
  return (
    <>
      {documentPanel}
      {showProjectPicker && (
        <ClarteProjectDocuments
          actor={actor}
          identity={identity}
          fromDocument
          onActivityRecorded={() => refreshAfterVersionWork(detail.id)}
          onOpenDocument={(documentId) => {
            setChoosingProject(false);
            void open(documentId);
          }}
          onClose={() => setChoosingProject(false)}
        />
      )}
    </>
  );
}

/** Brings one part of the Document panel into view; every part stays mounted. */
function PartLink({
  part,
  label,
  disabled,
  onActivate,
}: Readonly<{
  part: RefObject<HTMLDivElement | null>;
  label: string;
  disabled?: boolean;
  onActivate?: () => void;
}>) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        onActivate?.();
        requestAnimationFrame(() =>
          part.current?.scrollIntoView?.({ block: 'start' }),
        );
      }}
    >
      {label}
    </button>
  );
}

function Fact({
  term,
  children,
}: Readonly<{ term: string; children: ReactNode }>) {
  return (
    <div>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function projectAssociationLabel(
  association: DocumentProjectAssociation,
  notLinkedToProject: string,
): string {
  switch (association.state) {
    case 'linked':
      return association.project.title;
    case 'unlinked':
      return notLinkedToProject;
    default: {
      const exhaustive: never = association;
      return exhaustive;
    }
  }
}
