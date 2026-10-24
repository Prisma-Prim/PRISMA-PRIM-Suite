import { useOfferPreparationCopy } from './offer-preparation.copy';
import { useOfferPresentation } from './offer-presentation';
import { useOfferBindingCopy } from './offer-binding.copy';
import { useOfferDecisionCopy } from './offer-quality-decision.copy';
import {
  useOfferTransmissionCopy,
  useOfferClientResponseCopy,
} from './offer-transmission-response.copy';
import { useEstimateOfferCopy } from './offer-estimate.copy';
import {
  isIllustrativeOffer,
  type OfferReadView,
  type OfferDecisionView,
} from './offer-response';

export function OfferSummary({ offer }: { offer: OfferReadView }) {
  const copy = useOfferPreparationCopy();
  const decisionCopy = useOfferDecisionCopy();
  const transmissionCopy = useOfferTransmissionCopy();
  const responseCopy = useOfferClientResponseCopy();
  const { formatDateTime, formatDecimal, formatNumber } =
    useOfferPresentation();
  const internalCopy = useEstimateOfferCopy();
  const bindingCopy = useOfferBindingCopy();
  if (!isIllustrativeOffer(offer))
    return (
      <div className="offer-summary">
        <strong>{internalCopy('internal')}</strong>
        <p>{internalCopy('notice')}</p>
        <dl>
          <dt>{internalCopy('reference')}</dt>
          <dd>{formatNumber(offer.illustrativeReference)}</dd>
          <dt>{copy.version}</dt>
          <dd>{formatNumber(offer.version.versionNumber)}</dd>
          <dt>{copy.issuingCompany}</dt>
          <dd>{offer.version.issuingCompanyLabel}</dd>
          <dt>{copy.recipient}</dt>
          <dd>{offer.version.recipient.legalName}</dd>
          <dt>{internalCopy('amount')}</dt>
          <dd>
            {formatDecimal(offer.version.priceSource.amount)}{' '}
            {offer.version.priceSource.currency}
          </dd>
          <dt>{internalCopy('source')}</dt>
          <dd>
            {formatNumber(offer.version.priceSource.estimateVersionNumber)} ·{' '}
            {offer.version.priceSource.estimateVersionId}
          </dd>
          <dt>{internalCopy('approval')}</dt>
          <dd>
            {formatDateTime(offer.version.priceSource.approvedAt)} ·{' '}
            {offer.version.priceSource.approvalDecisionId}
          </dd>
          <dt>{copy.validUntil}</dt>
          <dd>{formatDateTime(offer.version.validUntil)}</dd>
          <dt>{copy.states}</dt>
          <dd>
            {offer.version.decisionState === 'REJECTED'
              ? copy.rejectedState
              : copy.stateValue}
          </dd>
        </dl>
        {offer.version.decision && (
          <OfferDecisionEvidence decision={offer.version.decision} />
        )}
        {offer.version.scopeNote && <p>{offer.version.scopeNote}</p>}
        {offer.version.commercialConditions && (
          <p>{offer.version.commercialConditions}</p>
        )}
      </div>
    );
  const version = offer.version;
  return (
    <div className="offer-summary">
      <strong>{copy.provisional}</strong>
      <dl>
        <div>
          <dt>{copy.reference}</dt>
          <dd>{formatNumber(offer.illustrativeReference)}</dd>
        </div>
        <div>
          <dt>{copy.version}</dt>
          <dd>{formatNumber(version.versionNumber)}</dd>
        </div>
        <div>
          <dt>{copy.issuingCompany}</dt>
          <dd>{version.issuingCompanyLabel}</dd>
        </div>
        <div>
          <dt>{copy.recipient}</dt>
          <dd>{version.recipient.legalName}</dd>
        </div>
        <div>
          <dt>{copy.validUntil}</dt>
          <dd>{formatDateTime(version.validUntil)}</dd>
        </div>
        <div>
          <dt>{copy.states}</dt>
          <dd>
            {version.clientResponse
              ? copy.responseStates[version.clientResponse.outcome]
              : version.transmissionState === 'TRANSMITTED'
                ? copy.transmittedState
                : version.decisionState === 'PENDING'
                  ? copy.stateValue
                  : version.decisionState === 'APPROVED'
                    ? copy.approvedState
                    : copy.rejectedState}
          </dd>
        </div>
        <div>
          <dt>{copy.snapshotTotal}</dt>
          <dd>
            {formatDecimal(version.pricingSnapshot.total)}{' '}
            {version.pricingSnapshot.currency}
          </dd>
        </div>
      </dl>
      {version.scopeNote && <p>{version.scopeNote}</p>}
      {version.commercialConditions && <p>{version.commercialConditions}</p>}
      {version.transmission && (
        <section
          className="offer-transmission-evidence"
          aria-labelledby="offer-transmission-evidence-title"
        >
          <h5 id="offer-transmission-evidence-title">
            {transmissionCopy.title}
          </h5>
          <p>{transmissionCopy.explanation}</p>
          <dl>
            <div>
              <dt>{transmissionCopy.actor}</dt>
              <dd>
                <code>{version.transmission.actorWorkspaceMembershipId}</code>
              </dd>
            </div>
            <div>
              <dt>{transmissionCopy.transmittedAt}</dt>
              <dd>{formatDateTime(version.transmission.transmittedAt)}</dd>
            </div>
            <div>
              <dt>{transmissionCopy.note}</dt>
              <dd>{version.transmission.note ?? transmissionCopy.noNote}</dd>
            </div>
            <div>
              <dt>{transmissionCopy.run}</dt>
              <dd>
                <code>{version.transmission.qualityRun.id}</code>
              </dd>
            </div>
            <div>
              <dt>{transmissionCopy.warnings}</dt>
              <dd>
                {version.transmission.acknowledgedWarningCodes.length
                  ? version.transmission.acknowledgedWarningCodes
                      .map((code) => decisionCopy.qualityLabels[code])
                      .join(', ')
                  : decisionCopy.noWarnings}
              </dd>
            </div>
            <div>
              <dt>{transmissionCopy.checksum}</dt>
              <dd>
                <code>{version.transmission.representationSha256}</code>
              </dd>
            </div>
          </dl>
        </section>
      )}
      {version.clientResponse && (
        <section
          className="offer-client-response-evidence"
          aria-labelledby="offer-client-response-evidence-title"
        >
          <h5 id="offer-client-response-evidence-title">
            {responseCopy.title}
          </h5>
          <p>{responseCopy.explanation}</p>
          <dl>
            <div>
              <dt>{responseCopy.actor}</dt>
              <dd>
                <code>{version.clientResponse.actorWorkspaceMembershipId}</code>
              </dd>
            </div>
            <div>
              <dt>{responseCopy.decidedAt}</dt>
              <dd>{formatDateTime(version.clientResponse.decidedAt)}</dd>
            </div>
            {version.clientResponse.outcome !== 'EXPIRED' && (
              <div>
                <dt>{responseCopy.recordedReceivedAt}</dt>
                <dd>{formatDateTime(version.clientResponse.receivedAt)}</dd>
              </div>
            )}
            {version.clientResponse.outcome === 'REJECTED' && (
              <div>
                <dt>{responseCopy.reason}</dt>
                <dd>{version.clientResponse.reason}</dd>
              </div>
            )}
          </dl>
        </section>
      )}
      {version.clientResponseState === 'PENDING' && version.validityElapsed && (
        <p>{responseCopy.pendingElapsed}</p>
      )}
      {version.decision && (
        <OfferDecisionEvidence decision={version.decision} />
      )}
      <section
        className="offer-representation"
        aria-labelledby="offer-representation-title"
      >
        <h5 id="offer-representation-title">{copy.representation}</h5>
        <p>
          <strong>
            {version.decisionState === 'PENDING'
              ? copy.draftState
              : version.decisionState === 'APPROVED'
                ? copy.approvedViewer
                : copy.rejectedViewer}
          </strong>
        </p>
        <dl>
          <div>
            <dt>{copy.templateVersion}</dt>
            <dd>
              {version.representation.templateCode} v
              {version.representation.templateVersion}
            </dd>
          </div>
          <div>
            <dt>{bindingCopy('ruleSet')}</dt>
            <dd>
              {version.qualityRuleSet} v{version.qualityRuleSetVersion}
            </dd>
          </div>
          <div>
            <dt>{copy.checksum}</dt>
            <dd>
              <code>{version.representation.sha256}</code>
            </dd>
          </div>
        </dl>
        {version.representation.templateVersion === 2 && (
          <p>{bindingCopy('adjustedSnapshot')}</p>
        )}
        <iframe
          title={copy.representationFrame}
          sandbox=""
          srcDoc={version.representation.html}
        />
      </section>
    </div>
  );
}

function OfferDecisionEvidence({ decision }: { decision: OfferDecisionView }) {
  const decisionCopy = useOfferDecisionCopy();
  const { formatDateTime } = useOfferPresentation();
  return (
    <dl>
      <div>
        <dt>{decisionCopy.actor}</dt>
        <dd>
          <code>{decision.actorWorkspaceMembershipId}</code>
        </dd>
      </div>
      <div>
        <dt>{decisionCopy.decidedAt}</dt>
        <dd>{formatDateTime(decision.decidedAt)}</dd>
      </div>
      {decision.state === 'REJECTED' && (
        <div>
          <dt>{decisionCopy.reason}</dt>
          <dd>{decision.reason}</dd>
        </div>
      )}
      {decision.state === 'APPROVED' && (
        <>
          <div>
            <dt>{decisionCopy.decisionRun}</dt>
            <dd>
              <code>{decision.qualityRun.id}</code> ·{' '}
              {decision.qualityRun.ruleSet} v
              {decision.qualityRun.ruleSetVersion}
            </dd>
          </div>
          <div>
            <dt>{decisionCopy.acknowledgedWarnings}</dt>
            <dd>
              {decision.acknowledgedWarningCodes.length
                ? decision.acknowledgedWarningCodes
                    .map((code) => decisionCopy.qualityLabels[code])
                    .join(', ')
                : decisionCopy.noWarnings}
            </dd>
          </div>
          <div>
            <dt>{decisionCopy.approvedChecksum}</dt>
            <dd>
              <code>{decision.representationSha256}</code>
            </dd>
          </div>
        </>
      )}
    </dl>
  );
}
