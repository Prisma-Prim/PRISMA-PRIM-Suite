import { ArrowLeft, ArrowRight, PencilLine } from 'lucide-react';
import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { ClientContactDescription } from '../../client/ClientContactEditor';
import { ClientCorrectionHistory } from '../../client/ClientCorrectionHistory';
import { ClientLegalEntities } from '../../client/ClientLegalEntities';
import { ClientUnionPanel } from '../../client/ClientUnionPanel';
import type { ClientDossierView } from '../../client/client-dossier-response';
import { useClientDirectoryCopy } from '../../client/client-directory.copy';
import { useClientDossierCopy } from '../../client/client-dossier.copy';
import { useClientLegalEntitiesCopy } from '../../client/client-legal-entities.copy';
import type { ClientLegalEntity } from '../../client/client-legal-entities-response';
import { useClientUnionConfirmationCopy } from '../../client/client-union-confirmation.copy';
import { useClientDossier } from '../../client/use-client-dossier';
import type {
  ClientLinkTarget,
  ClientWorkspaceOwner,
  ClientWorkspaceProps,
} from '../../client/use-client-workspace';
import { ClarteBadge } from '../components/ClarteBadge';
import { ClarteButton } from '../components/ClarteButton';
import {
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import {
  ClarteClientCorrection,
  CorrectionFeedback,
} from './ClarteClientCorrection';
import { ClarteNotice } from './ClarteNotice';
import { clientInitials } from './client-initials';
import { useClarteClientCopy } from './clarte-clients.copy';

/** The views of a dossier, in the order its tab list offers them. */
const dossierViews = [
  'overview',
  'contacts',
  'legal-entities',
  'deals',
  'missions',
  'documents',
  'history',
] as const;
type DossierView = (typeof dossierViews)[number];

/** Each part of the dossier is mounted once and shown in the views listing it. */
type DossierPart =
  | 'record'
  | 'contacts'
  | 'legal-entities'
  | 'commercial'
  | 'missions'
  | 'documents'
  | 'corrections'
  | 'merges';

const viewParts: Readonly<Record<DossierView, readonly DossierPart[]>> = {
  overview: ['record', 'commercial', 'missions', 'documents'],
  contacts: ['contacts'],
  'legal-entities': ['legal-entities'],
  deals: ['commercial'],
  missions: ['missions'],
  documents: ['documents'],
  history: ['corrections', 'merges'],
};

/**
 * One Client's dossier page (#1536): its identity, legal entities and
 * status, then its views. The dossier owner is the current interface's, so
 * the read, the correction draft, its version and retry key are the same;
 * a union outcome rereads it under the new revision and remounts the parts
 * read from it. The union panel keeps its place and state as long as this
 * Client stays selected, like the current interface's.
 */
export function ClarteClientDossier({
  clientId,
  owner,
  props,
  companyContextId,
  shown,
  opening,
}: Readonly<{
  clientId: string;
  owner: ClientWorkspaceOwner;
  props: ClientWorkspaceProps;
  companyContextId: string;
  /** False while the member is back in the directory; the page stays mounted. */
  shown: boolean;
  /** Counts each time the member opens a dossier page. */
  opening: number;
}>) {
  const copy = useClientDossierCopy();
  const legalCopy = useClientLegalEntitiesCopy();
  const { message } = useClarteClientCopy();
  const unionConfirmationCopy = useClientUnionConfirmationCopy();
  const revision = owner.union.revision;
  const canUpdate = owner.access.canUpdateClients;
  const dossier = useClientDossier({
    clientAccountId: clientId,
    companyContextId,
    canUpdate,
    identity: props.identity,
    captureRecovery: owner.captureRecovery,
    onCompanyContextRejected: props.onCompanyContextRejected,
    onActorRevalidated: props.onActorRevalidated,
    onWorkspaceAccessRejected: props.onWorkspaceAccessRejected,
    onActivityRecorded: props.onActivityRecorded,
    onClientsChanged: () => owner.reloadClients(companyContextId),
    onDuplicateReviewRequired: owner.duplicateReview.request,
    revision,
  });
  const tabsId = useId();
  const heading = useRef<HTMLHeadingElement | null>(null);
  const [chosenView, setView] = useState<DossierView>('overview');
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [legalEntities, setLegalEntities] = useState<
    readonly ClientLegalEntity[] | undefined
  >(undefined);
  const state = dossier.state;
  const record = state.status === 'ready' ? state.dossier : undefined;
  // Each opening moves focus to the dossier's name once it is read, so a
  // keyboard or screen reader user starts there; a reread after a union
  // outcome keeps focus where it is.
  const focusedOpening = useRef<number | undefined>(undefined);
  const ready = record !== undefined;
  useEffect(() => {
    if (!ready || !shown || focusedOpening.current === opening) return;
    focusedOpening.current = opening;
    heading.current?.focus();
  }, [ready, shown, opening]);
  // A union outcome rereads the dossier; its legal entities follow.
  useEffect(() => {
    setLegalEntities(undefined);
    setCorrectionOpen(false);
  }, [revision]);
  const leave = () => {
    owner.dossier.close();
    // The directory shows again; focus returns to the Client's card.
    window.requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(
          `[data-client-card="${CSS.escape(clientId)}"] button`,
        )
        ?.focus(),
    );
  };
  const commercial = record && props.renderCommercialWork?.(record.id);
  const missions = record && props.renderMissionWork?.(record.id);
  const documents = record && props.renderDocumentWork?.(record.id);
  const offered = dossierViews.filter((candidate) => {
    if (candidate === 'deals')
      return commercial !== undefined || props.onOpenRequests !== undefined;
    if (candidate === 'missions')
      return missions !== undefined || props.onOpenProjects !== undefined;
    if (candidate === 'documents')
      return documents !== undefined || props.onOpenDocuments !== undefined;
    return true;
  });
  // A view whose parts are no longer offered, after a change of grant, falls
  // back to the overview.
  const view = offered.includes(chosenView) ? chosenView : 'overview';
  const shows = (part: DossierPart) => viewParts[view].includes(part);
  const correctionFeedback = <CorrectionFeedback dossier={dossier} />;
  const openCorrection = () => {
    if (!record || correctionOpen) return;
    dossier.correction.prepare(record);
    setCorrectionOpen(true);
  };
  const viewLabel: Record<DossierView, string> = {
    overview: message('viewOverview'),
    contacts: copy.contactsLabel,
    'legal-entities': legalCopy.title,
    deals: message('viewDeals'),
    missions: message('viewMissions'),
    documents: message('viewDocuments'),
    history: message('viewHistory'),
  };
  const tabId = (candidate: DossierView) => `${tabsId}-${candidate}`;
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = offered.indexOf(view);
    const next =
      event.key === 'ArrowRight'
        ? offered[(index + 1) % offered.length]
        : event.key === 'ArrowLeft'
          ? offered[(index - 1 + offered.length) % offered.length]
          : event.key === 'Home'
            ? offered[0]
            : event.key === 'End'
              ? offered[offered.length - 1]
              : undefined;
    if (!next) return;
    event.preventDefault();
    setView(next);
    document.getElementById(tabId(next))?.focus();
  };
  // The union panel stays reachable beside a dossier that cannot be read,
  // as the current interface keeps it beside any dossier state.
  const mergesShown = record
    ? shows('merges')
    : state.status !== 'idle' && state.status !== 'loading';
  return (
    <section
      className="clarte-client-dossier"
      aria-labelledby={record ? `${tabsId}-title` : undefined}
    >
      <div className="clarte-client-back">
        <ClarteButton variant="quiet" size="small" onClick={leave}>
          <ArrowLeft aria-hidden="true" />
          {message('backToClients')}
        </ClarteButton>
      </div>
      {owner.union.confirmedClientId === clientId && (
        <ClarteNotice tone="success" role="status">
          {unionConfirmationCopy.saved}
        </ClarteNotice>
      )}
      {!record ? (
        state.status === 'notFound' ? (
          <ClarteErrorState title={copy.dossierNotFound} />
        ) : state.status === 'forbidden' ? (
          <ClarteErrorState title={copy.permissionDenied} />
        ) : state.status === 'error' ? (
          <ClarteErrorState
            title={copy.dossierLoadError}
            action={
              <ClarteButton onClick={() => void dossier.reload(clientId)}>
                {message('retry')}
              </ClarteButton>
            }
          />
        ) : (
          <ClarteLoadingState label={copy.loadingDossier} />
        )
      ) : (
        <>
          <DossierHeader
            record={record}
            titleId={`${tabsId}-title`}
            version={dossier.displayedVersion(record)}
            legalEntities={legalEntities}
            companyName={props.actor.activeCompany?.displayName}
            correctionOpen={correctionOpen}
            onCorrect={canUpdate ? openCorrection : undefined}
            headingRef={(element) => {
              heading.current = element;
              owner.dossier.receiveHeading(element);
            }}
          />
          {!correctionOpen && correctionFeedback}
          <div
            className="clarte-client-views"
            role="tablist"
            aria-label={message('dossierSections')}
          >
            {offered.map((candidate) => (
              <button
                key={candidate}
                id={tabId(candidate)}
                type="button"
                role="tab"
                aria-selected={candidate === view}
                aria-controls={`${tabsId}-panel`}
                tabIndex={candidate === view ? 0 : -1}
                onClick={() => setView(candidate)}
                onKeyDown={moveFocus}
              >
                {viewLabel[candidate]}
              </button>
            ))}
          </div>
        </>
      )}
      <div
        id={`${tabsId}-panel`}
        role={record ? 'tabpanel' : undefined}
        aria-labelledby={record ? tabId(view) : undefined}
        className="clarte-client-panel"
      >
        {record && (
          <Fragment key={revision}>
            <div className="clarte-client-part" hidden={!shows('record')}>
              <RecordCard record={record} />
            </div>
            <div className="clarte-client-part" hidden={!shows('contacts')}>
              <ContactsCard
                record={record}
                onEdit={canUpdate ? openCorrection : undefined}
              />
            </div>
            <div
              className="clarte-client-part"
              hidden={!shows('legal-entities')}
            >
              <ClientLegalEntities
                clientAccountId={record.id}
                dossierVersion={record.version}
                companyContextId={companyContextId}
                canUpdate={canUpdate}
                identity={props.identity}
                captureRecovery={owner.captureRecovery}
                onCompanyContextRejected={props.onCompanyContextRejected}
                onActorRevalidated={
                  props.onActorRevalidated ?? (() => undefined)
                }
                onWorkspaceAccessRejected={
                  props.onWorkspaceAccessRejected ?? (() => undefined)
                }
                onClientVersionChanged={dossier.confirmVersion}
                onActivityRecorded={props.onActivityRecorded}
                onLegalEntitiesRead={setLegalEntities}
              />
            </div>
            <WorkPart
              hidden={!shows('commercial')}
              intro={view === 'deals' ? message('dealsIntro') : undefined}
              work={commercial}
              label={copy.openRequests}
              target={record}
              onOpen={props.onOpenRequests}
            />
            <WorkPart
              hidden={!shows('missions')}
              intro={view === 'missions' ? message('missionsIntro') : undefined}
              work={missions}
              label={copy.openProjects}
              target={record}
              onOpen={props.onOpenProjects}
            />
            <WorkPart
              hidden={!shows('documents')}
              intro={
                view === 'documents' ? message('documentsIntro') : undefined
              }
              work={documents}
              label={copy.openDocuments}
              target={record}
              onOpen={props.onOpenDocuments}
            />
            {view === 'history' && (
              <p className="clarte-clients-intro">{message('historyIntro')}</p>
            )}
            <div className="clarte-client-part" hidden={!shows('corrections')}>
              <ClientCorrectionHistory
                clientAccountId={record.id}
                dossierVersion={record.version}
                companyContextId={companyContextId}
                identity={props.identity}
                captureRecovery={owner.captureRecovery}
                onCompanyContextRejected={props.onCompanyContextRejected}
                onActorRevalidated={
                  props.onActorRevalidated ?? (() => undefined)
                }
                onWorkspaceAccessRejected={
                  props.onWorkspaceAccessRejected ?? (() => undefined)
                }
              />
            </div>
          </Fragment>
        )}
        <div className="clarte-client-part" hidden={!mergesShown}>
          <ClientUnionPanel
            clientId={clientId}
            companyContextId={companyContextId}
            identity={props.identity}
            captureRecovery={owner.captureRecovery}
            canResolve={owner.access.canResolveDuplicateClients}
            onConfirmed={owner.union.confirm}
            onCompanyContextRejected={props.onCompanyContextRejected}
            onWorkspaceAccessRejected={
              props.onWorkspaceAccessRejected ?? (() => undefined)
            }
            onActorRevalidated={props.onActorRevalidated ?? (() => undefined)}
            onOpenCanonical={(canonicalClientId) => {
              // Opening the canonical record shows it from its overview.
              setView('overview');
              void owner.union.showOutcome(companyContextId, canonicalClientId);
            }}
            onChanged={(canonicalClientId) =>
              owner.union.changed(companyContextId, canonicalClientId)
            }
          />
        </div>
      </div>
      {canUpdate && correctionOpen && record && (
        <ClarteClientCorrection
          dossier={dossier}
          feedback={correctionFeedback}
          onClose={() => setCorrectionOpen(false)}
        />
      )}
    </section>
  );
}

function DossierHeader({
  record,
  titleId,
  version,
  legalEntities,
  companyName,
  correctionOpen,
  onCorrect,
  headingRef,
}: Readonly<{
  record: ClientDossierView;
  titleId: string;
  version: number;
  legalEntities: readonly ClientLegalEntity[] | undefined;
  companyName: string | undefined;
  correctionOpen: boolean;
  onCorrect: (() => void) | undefined;
  headingRef: (element: HTMLHeadingElement | null) => void;
}>) {
  const copy = useClientDossierCopy();
  const directoryCopy = useClientDirectoryCopy();
  const clarteCopy = useClarteClientCopy();
  return (
    <header className="clarte-client-head">
      <span
        className="clarte-client-initials clarte-client-initials--large"
        aria-hidden="true"
      >
        {clientInitials(record.displayName)}
      </span>
      <div className="clarte-client-identity">
        <p className="clarte-client-eyebrow">{copy.dossierEyebrow}</p>
        <h2 id={titleId} tabIndex={-1} ref={headingRef}>
          {record.displayName}
        </h2>
        <div className="clarte-client-badges">
          {companyName !== undefined && (
            <ClarteBadge tone="success">
              {directoryCopy.availableInCompany(companyName)}
            </ClarteBadge>
          )}
          {legalEntities !== undefined && (
            <ClarteBadge tone="info">
              {clarteCopy.legalEntities(legalEntities.length)}
            </ClarteBadge>
          )}
          <ClarteBadge>{copy.version(version)}</ClarteBadge>
        </div>
      </div>
      {onCorrect && (
        <div className="clarte-client-head-actions">
          <ClarteButton
            aria-expanded={correctionOpen}
            aria-haspopup="dialog"
            onClick={onCorrect}
          >
            <PencilLine aria-hidden="true" />
            {copy.correctionFormLabel}
          </ClarteButton>
        </div>
      )}
    </header>
  );
}

function RecordCard({ record }: Readonly<{ record: ClientDossierView }>) {
  const copy = useClientDossierCopy();
  const titleId = useId();
  const fields: readonly (readonly [string, string | null])[] = [
    [copy.taxIdLabel, record.taxId],
    [copy.addressLabel, record.address],
    [copy.telephoneLabel, record.telephone],
    [copy.generalEmailLabel, record.generalEmail],
    [copy.businessActivityLabel, record.businessActivity],
    [
      copy.involvedCompaniesLabel,
      record.involvedCompanyDisplayNames.join(', '),
    ],
  ];
  return (
    <section className="clarte-client-card-section" aria-labelledby={titleId}>
      <h3 id={titleId}>{copy.sharedDetails}</h3>
      <dl className="clarte-client-record">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || copy.notProvided}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ContactsCard({
  record,
  onEdit,
}: Readonly<{ record: ClientDossierView; onEdit: (() => void) | undefined }>) {
  const copy = useClientDossierCopy();
  const { message } = useClarteClientCopy();
  const titleId = useId();
  return (
    <section className="clarte-client-card-section" aria-labelledby={titleId}>
      <div className="clarte-client-section-head">
        <div>
          <h3 id={titleId}>{copy.contactsLabel}</h3>
          <p className="clarte-clients-intro">{message('contactsIntro')}</p>
        </div>
        {onEdit && (
          <ClarteButton size="small" onClick={onEdit}>
            <PencilLine aria-hidden="true" />
            {message('editContacts')}
          </ClarteButton>
        )}
      </div>
      {record.contacts.length === 0 ? (
        <p className="clarte-clients-empty-line">{copy.noContacts}</p>
      ) : (
        <ul className="clarte-client-contacts">
          {record.contacts.map((contact, index) => (
            <li key={`${contact.name}-${index}`}>
              <span
                className="clarte-client-initials clarte-client-initials--small"
                aria-hidden="true"
              >
                {clientInitials(contact.name)}
              </span>
              <div>
                <strong>{contact.name}</strong>
                <span className="clarte-client-contact-lines">
                  {contact.telephone && <span>{contact.telephone}</span>}
                  {contact.email && <span>{contact.email}</span>}
                  <ClientContactDescription contact={contact} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** One other owner's overview of this Client, with its way to the full list. */
function WorkPart({
  hidden,
  intro,
  work,
  label,
  target,
  onOpen,
}: Readonly<{
  hidden: boolean;
  intro: string | undefined;
  work: ReactNode;
  label: string;
  target: ClientDossierView;
  onOpen: ((client: ClientLinkTarget) => void) | undefined;
}>) {
  if (work === undefined && !onOpen) return null;
  return (
    <div className="clarte-client-part clarte-client-work" hidden={hidden}>
      {intro && <p className="clarte-clients-intro">{intro}</p>}
      {work}
      {onOpen && (
        <div className="clarte-client-work-actions">
          <ClarteButton
            size="small"
            onClick={() =>
              onOpen({ id: target.id, displayName: target.displayName })
            }
          >
            {label}
            <ArrowRight aria-hidden="true" />
          </ClarteButton>
        </div>
      )}
    </div>
  );
}
