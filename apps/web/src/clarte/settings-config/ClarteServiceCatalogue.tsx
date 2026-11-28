import { Info, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  useServiceCatalogue,
  type CatalogueFeedback,
  type CatalogueListState,
  type ServiceCatalogueProps,
} from '../../commercial-catalogue/ServiceCatalogueWorkspace';
import { useServiceCatalogueCopy } from '../../commercial-catalogue/service-catalogue.copy';
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
import { useSettingsConfigCopy } from './settings-config.copy';
import './settings-config.css';

/** The form a confirmed command closes; a refusal keeps it open. */
function useClosingForm(feedback: CatalogueFeedback | undefined) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(feedback);
  if (feedback !== seen) {
    setSeen(feedback);
    if (feedback?.tone === 'status') setOpen(false);
  }
  return [open, setOpen] as const;
}

/**
 * The Service catalogue in the Settings console (EX-070, EX-071): the shared
 * Service definitions and the active Company's Offerings, each defined or
 * registered from a side panel through the existing catalogue commands.
 */
export function ClarteServiceCatalogue(props: ServiceCatalogueProps) {
  const copy = useServiceCatalogueCopy();
  const config = useSettingsConfigCopy();
  const catalogue = useServiceCatalogue(props);
  const {
    definitions,
    offerings,
    definitionForm,
    setDefinitionForm,
    offeringForm,
    setOfferingForm,
    definitionFeedback,
    offeringFeedback,
    pending,
    companyId,
    companyName,
    feedbackMessage,
  } = catalogue;
  const [defining, setDefining] = useClosingForm(definitionFeedback);
  const [offering, setOffering] = useClosingForm(offeringFeedback);
  if (catalogue.denied) return <ClarteErrorState title={copy.denied} />;
  const definitionChoices =
    definitions.kind === 'ready' ? definitions.items : [];
  const feedback = (value: CatalogueFeedback | undefined) =>
    value && (
      <p className={`clarte-settings-${value.tone}`} role={value.tone}>
        {feedbackMessage(value)}
      </p>
    );
  return (
    <div className="clarte-config">
      <aside className="clarte-config-notice" aria-label={copy.noticeLabel}>
        <Info aria-hidden="true" />
        <div>
          <strong>{copy.illustrativeMarker}</strong>
          <p>{copy.illustrativeDetail}</p>
          <p>{copy.abilityDisclaimer}</p>
        </div>
      </aside>
      <ClarteCard
        title={copy.definitionsTitle}
        actions={
          <ClarteButton
            variant="quiet"
            size="small"
            className="clarte-config-soft"
            onClick={() => setDefining(true)}
          >
            <Plus aria-hidden="true" />
            {copy.defineService}
          </ClarteButton>
        }
      >
        <p className="clarte-settings-hint">{copy.definitionsDescription}</p>
        {!defining && feedback(definitionFeedback)}
        <CatalogueTable
          state={definitions}
          label={copy.definitionsList}
          loading={copy.definitionsLoading}
          empty={copy.definitionsEmpty}
          error={copy.definitionsError}
          retry={copy.retryDefinitions}
          showOlder={copy.showOlderDefinitions}
          olderLoading={copy.olderDefinitionsLoading}
          olderError={copy.olderDefinitionsError}
          columns={[copy.code, config.service, config.provenance]}
          onReload={() =>
            companyId && void catalogue.loadDefinitions(companyId)
          }
          onLoadOlder={(cursor) =>
            companyId && void catalogue.loadDefinitions(companyId, cursor)
          }
          renderRow={(definition) => [
            <span key="code" className="clarte-config-code">
              {definition.code}
            </span>,
            <span key="name" className="clarte-settings-cell-stack">
              <strong>{definition.name}</strong>
              {definition.description && (
                <small>{definition.description}</small>
              )}
            </span>,
            <ClarteBadge key="provenance">
              {copy.provenanceLabels[definition.provenance]}
            </ClarteBadge>,
          ]}
        />
      </ClarteCard>
      <ClarteCard
        title={copy.offeringsTitle(companyName)}
        actions={
          <ClarteButton
            size="small"
            disabled={definitions.kind !== 'ready'}
            onClick={() => setOffering(true)}
          >
            <Plus aria-hidden="true" />
            {copy.offerService}
          </ClarteButton>
        }
      >
        <p className="clarte-settings-hint">{copy.offeringsDescription}</p>
        {!offering && feedback(offeringFeedback)}
        <CatalogueTable
          state={offerings}
          label={copy.offeringsList}
          loading={copy.offeringsLoading}
          empty={copy.offeringsEmpty(companyName)}
          error={copy.offeringsError}
          retry={copy.retryOfferings}
          showOlder={copy.showOlderOfferings}
          olderLoading={copy.olderOfferingsLoading}
          olderError={copy.olderOfferingsError}
          columns={[
            copy.code,
            config.service,
            config.availability,
            config.provenance,
          ]}
          onReload={() => companyId && void catalogue.loadOfferings(companyId)}
          onLoadOlder={(cursor) =>
            companyId && void catalogue.loadOfferings(companyId, cursor)
          }
          renderRow={(item) => [
            <span key="code" className="clarte-config-code">
              {item.serviceDefinition.code}
            </span>,
            <span key="name" className="clarte-settings-cell-stack">
              <strong>{item.serviceDefinition.name}</strong>
              {item.commercialLabel && <small>{item.commercialLabel}</small>}
            </span>,
            <ClarteBadge key="availability" tone="success">
              {copy.availabilityLabels[item.availability]}
            </ClarteBadge>,
            <ClarteBadge key="provenance">
              {copy.provenanceLabels[item.provenance]}
            </ClarteBadge>,
          ]}
        />
      </ClarteCard>
      {defining && (
        <ClarteSidePanel
          title={copy.definitionsTitle}
          description={copy.definitionsDescription}
          dismissible={!pending}
          onClose={() => setDefining(false)}
        >
          <form
            className="clarte-settings-form"
            noValidate
            onSubmit={(event) => void catalogue.submitDefinition(event)}
          >
            {feedback(definitionFeedback)}
            <ClarteField label={copy.code} hint={copy.codeHelp}>
              {(control) => (
                <input
                  {...control}
                  className="clarte-input clarte-config-code"
                  value={definitionForm.code}
                  required
                  maxLength={40}
                  onChange={(event) =>
                    setDefinitionForm((current) => ({
                      ...current,
                      code: event.target.value.toUpperCase(),
                    }))
                  }
                />
              )}
            </ClarteField>
            <ClarteField label={copy.name}>
              {(control) => (
                <input
                  {...control}
                  className="clarte-input"
                  value={definitionForm.name}
                  required
                  onChange={(event) =>
                    setDefinitionForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              )}
            </ClarteField>
            <ClarteField label={copy.description}>
              {(control) => (
                <textarea
                  {...control}
                  className="clarte-input"
                  value={definitionForm.description}
                  onChange={(event) =>
                    setDefinitionForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              )}
            </ClarteField>
            <div className="clarte-settings-actions">
              <ClarteButton type="submit" variant="primary" disabled={pending}>
                {copy.defineService}
              </ClarteButton>
            </div>
          </form>
        </ClarteSidePanel>
      )}
      {offering && (
        <ClarteSidePanel
          title={copy.offeringsTitle(companyName)}
          description={copy.offeringsDescription}
          dismissible={!pending}
          onClose={() => setOffering(false)}
        >
          <form
            className="clarte-settings-form"
            noValidate
            onSubmit={(event) => void catalogue.submitOffering(event)}
          >
            {feedback(offeringFeedback)}
            <ClarteField label={copy.offeredDefinition}>
              {(control) => (
                <Select
                  id={control.id}
                  describedBy={control['aria-describedby']}
                  value={offeringForm.serviceDefinitionId}
                  placeholder={copy.selectDefinition}
                  options={definitionChoices.map((definition) => ({
                    value: definition.id,
                    label: `${definition.code} — ${definition.name}`,
                  }))}
                  onValueChange={(value) =>
                    setOfferingForm((current) => ({
                      ...current,
                      serviceDefinitionId: value,
                    }))
                  }
                  required
                />
              )}
            </ClarteField>
            {definitionChoices.length === 0 && (
              <p className="clarte-settings-hint">
                {copy.noDefinitionsToOffer}
              </p>
            )}
            <ClarteField
              label={copy.commercialLabel}
              hint={copy.commercialLabelHelp}
            >
              {(control) => (
                <input
                  {...control}
                  className="clarte-input"
                  value={offeringForm.commercialLabel}
                  onChange={(event) =>
                    setOfferingForm((current) => ({
                      ...current,
                      commercialLabel: event.target.value,
                    }))
                  }
                />
              )}
            </ClarteField>
            <div className="clarte-settings-actions">
              <ClarteButton type="submit" variant="primary" disabled={pending}>
                {copy.offerService}
              </ClarteButton>
            </div>
          </form>
        </ClarteSidePanel>
      )}
    </div>
  );
}

/** A paged catalogue list as a table, with its loading, empty and error states. */
function CatalogueTable<T extends { id: string }>({
  state,
  label,
  loading,
  empty,
  error,
  retry,
  showOlder,
  olderLoading,
  olderError,
  columns,
  onReload,
  onLoadOlder,
  renderRow,
}: Readonly<{
  state: CatalogueListState<T>;
  label: string;
  loading: string;
  empty: string;
  error: string;
  retry: string;
  showOlder: string;
  olderLoading: string;
  olderError: string;
  columns: readonly string[];
  onReload: () => void;
  onLoadOlder: (cursor: string) => void;
  renderRow: (item: T) => ReactNode[];
}>) {
  if (state.kind === 'loading') return <ClarteLoadingState label={loading} />;
  if (state.kind === 'error')
    return (
      <ClarteErrorState
        title={error}
        action={<ClarteButton onClick={onReload}>{retry}</ClarteButton>}
      />
    );
  if (state.items.length === 0) return <ClarteEmptyState title={empty} />;
  const nextCursor = state.nextCursor;
  return (
    <>
      <div className="clarte-table-wrap">
        <table className="clarte-table clarte-config-table" aria-label={label}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.items.map((item) => (
              <tr key={item.id}>
                {renderRow(item).map((cell, index) => (
                  <td key={index} data-label={columns[index]}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {state.olderPage === 'loading' && (
        <p className="clarte-settings-status" role="status">
          {olderLoading}
        </p>
      )}
      {state.olderPage === 'error' && (
        <p className="clarte-settings-alert" role="alert">
          {olderError}
        </p>
      )}
      {nextCursor && (
        <div className="clarte-settings-actions">
          <ClarteButton
            size="small"
            disabled={state.olderPage === 'loading'}
            onClick={() => onLoadOlder(nextCursor)}
          >
            {showOlder}
          </ClarteButton>
        </div>
      )}
    </>
  );
}
