import { fireEvent, screen } from '@testing-library/react';
import type { ActorContext } from '../access-types';
import {
  deterministicBrowserIdentity,
  type BrowserIdentity,
} from '../access-composition';
import { modelOfferActor } from '../offer/model-offer.fixture';
import { pdfTarget } from '../commercial-pdf/commercial-pdf.test-fixture';
import {
  InterfaceLocaleProvider,
  useInterfaceLocale,
} from '../localization/interface-locale';
import {
  OfferMessagePreparation,
  type OfferMessageTarget,
} from './offer-message-preparation';

export const target: OfferMessageTarget = {
  ...pdfTarget,
  kind: 'offer',
  provenance: 'COMPANY_MODEL_ESTIMATE',
  language: 'ro',
  sourceRendererCode: 'OFFER_COMPANY_CONSULTING_RO',
};
export const capture = `offer-message-read.v1.${'b'.repeat(64)}`;
export function messageActor(readCapture = capture) {
  const commercialIntakePermissions: NonNullable<
    ActorContext['activeCompany']
  >['commercialIntakePermissions'] = [
    'commercial.request.read',
    'commercial.opportunity.read',
  ];
  const company = {
    ...modelOfferActor.activeCompany,
    id: target.companyId,
    displayName: 'Synthetic Company',
    offerMessageReadCapture: readCapture,
    commercialIntakePermissions,
  };
  return {
    ...modelOfferActor,
    workspaceId: target.workspaceId,
    displayName: 'Synthetic Actor',
    activeCompany: company,
  } satisfies ActorContext;
}
export const identity = deterministicBrowserIdentity({
  'x-test-external-subject': 'message-reader-1043',
});
export function observation(source = target, readCapture = capture) {
  return {
    format: 'offer-message-preparation.v1',
    readCapture,
    source,
    party: {
      kind: 'PRIMARY',
      legalName: 'Synthetic Offer party',
      taxId: null,
      legalAddress: null,
    },
    actor: {
      workspaceMembershipId: messageActor().workspaceMembershipId,
      displayName: 'Synthetic Actor',
    },
  };
}
export function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
export function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Deferred promise not initialized');
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve: (value: T) => resolve(value) };
}
function Languages() {
  const locale = useInterfaceLocale();
  return (
    <>
      {(
        ['ro', 'ru', 'fr', 'en'] satisfies Parameters<
          typeof locale.changeLocale
        >[0][]
      ).map((language) => (
        <button key={language} onClick={() => locale.changeLocale(language)}>
          {language}
        </button>
      ))}
    </>
  );
}
export function panel({
  actor = messageActor(),
  source = target,
  generation = 1,
  browserIdentity = identity,
  onActorRevalidated = () => undefined,
  onCompanyContextRejected = () => undefined,
  onWorkspaceAccessRejected = () => undefined,
  visible = true,
}: {
  actor?: ActorContext;
  source?: OfferMessageTarget;
  generation?: number;
  browserIdentity?: BrowserIdentity;
  onActorRevalidated?: (actor: ActorContext) => void | Promise<void>;
  onCompanyContextRejected?: (companyId: string) => void;
  onWorkspaceAccessRejected?: () => void | Promise<void>;
  visible?: boolean;
} = {}) {
  return (
    <InterfaceLocaleProvider>
      <Languages />
      <OfferMessagePreparation
        actor={actor}
        identity={browserIdentity}
        target={visible ? { source, generation } : null}
        onActorRevalidated={onActorRevalidated}
        onCompanyContextRejected={onCompanyContextRejected}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />
    </InterfaceLocaleProvider>
  );
}
export async function ready() {
  await screen.findByText('Immutable Offer party: Synthetic Offer party');
}
export const literal = {
  recipient: 'Case+literal@Example.test',
  subject: '  Manual 🌍 subject  ',
  body: '  Manual body\n\t🌍 next line  ',
};
export function fillAndReview() {
  fireEvent.change(screen.getByRole('textbox', { name: 'Recipient' }), {
    target: { value: literal.recipient },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Subject' }), {
    target: { value: literal.subject },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Message body' }), {
    target: { value: literal.body },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review message' }));
}
