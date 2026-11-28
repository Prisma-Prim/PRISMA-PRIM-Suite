import { useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { grantOf } from '../access/company-grants';
import { useCommercialPdfDownload } from '../commercial-pdf/CommercialPdfDownload';
import {
  OfferMessagePreparation,
  type OfferMessageTarget,
} from '../offer-message/offer-message-preparation';
import { OfferPanel } from './OfferPanel';

/** The exact Offer Version a navigation opens, numbered by its request. */
export type RequestedOfferVersion = Readonly<{
  requestId: number;
  offerVersionId: string;
}>;

/**
 * The part of an Offer panel key that remounts it when the captured Offer
 * Preparer assignment or version, or the Offer permissions of either Offer
 * bundle, change.
 */
export function offerPanelGrantKey(actor: ActorContext): string {
  const preparer = grantOf(actor.activeCompany, 'company_offer_preparer');
  const permissions = [
    ...(preparer?.permissions ?? []),
    ...(grantOf(actor.activeCompany, 'company_offer_approver')?.permissions ??
      []),
  ];
  return `${preparer?.assignmentId ?? 'no-assignment'}:${preparer?.permissionSetVersion ?? 'no-version'}:${permissions.join(',')}`;
}

/**
 * The Offer commands of one Opportunity: the cover message preparation, the
 * exact PDF and the Offer panel. The current Request detail and the Clarté
 * deal page's Offer stage both render this one owner.
 */
export function OfferWorkspace({
  actor,
  identity,
  clientRequestId,
  opportunityId,
  requestedOffer,
  currentClientId,
  clientDisplayName,
  panelKey,
  besideVersion,
  onChanged,
  onCompanyContextRejected,
  onActorRevalidated,
  onWorkspaceAccessRejected,
}: Readonly<{
  actor: ActorContext;
  identity: BrowserIdentity;
  clientRequestId: string;
  opportunityId: string;
  requestedOffer: RequestedOfferVersion | undefined;
  currentClientId: string | undefined;
  clientDisplayName: string | undefined;
  /** Remounts the Offer panel when its caller's authority changes. */
  panelKey: string;
  /** Lays the commands out beside the exact version they act on. */
  besideVersion?: boolean;
  /** After each confirmed Offer command. */
  onChanged?: () => void;
  onCompanyContextRejected: (companyContextId: string) => void;
  onActorRevalidated: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected: () => Promise<void> | void;
}>) {
  // The owner survives Request changes. A monotonic navigation identity
  // prevents an old A draft from reviving after A → B → A.
  const messageNavigation = JSON.stringify([
    clientRequestId,
    opportunityId,
    requestedOffer?.requestId,
    requestedOffer?.offerVersionId,
  ]);
  const messageOwner = useRef({
    navigation: messageNavigation,
    generation: 0,
    open: 0,
  });
  if (messageOwner.current.navigation !== messageNavigation) {
    messageOwner.current = {
      ...messageOwner.current,
      navigation: messageNavigation,
      generation: messageOwner.current.generation + 1,
    };
  }
  const [messageTarget, setMessageTarget] = useState<{
    source: OfferMessageTarget;
    generation: number;
    navigationGeneration: number;
  } | null>(null);
  const prepareMessage = (source: OfferMessageTarget) => {
    messageOwner.current.open += 1;
    setMessageTarget({
      source,
      generation: messageOwner.current.open,
      navigationGeneration: messageOwner.current.generation,
    });
  };
  const retireMessage = () => {
    setMessageTarget(null);
  };
  const offerPdf = useCommercialPdfDownload({
    actor,
    identity,
    opportunityId,
    onCompanyContextRejected,
    onActorRevalidated,
    onWorkspaceAccessRejected,
    kind: 'offer',
    navigation: requestedOffer?.requestId,
  });
  return (
    <>
      <OfferMessagePreparation
        actor={actor}
        identity={identity}
        target={
          messageTarget?.navigationGeneration ===
          messageOwner.current.generation
            ? messageTarget
            : null
        }
        onCompanyContextRejected={onCompanyContextRejected}
        onActorRevalidated={onActorRevalidated}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />
      {offerPdf.controls}
      <OfferPanel
        key={panelKey}
        pdf={offerPdf.callbacks}
        onPrepareMessage={prepareMessage}
        onMessageNavigate={retireMessage}
        actor={actor}
        identity={identity}
        opportunityId={opportunityId}
        requestedVersionId={requestedOffer?.offerVersionId}
        currentClientId={currentClientId}
        clientDisplayName={clientDisplayName}
        besideVersion={besideVersion}
        onChanged={onChanged}
        onCompanyContextRejected={onCompanyContextRejected}
        onActorRevalidated={onActorRevalidated}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />
    </>
  );
}
