import { expect } from 'vitest';
import type { ActorContext } from '../access-types';
import {
  fireEvent,
  screen,
  waitFor,
  within,
} from './render-with-interface-locale';
import {
  withCompanyGrants,
  withoutCompanyGrants,
} from '../access/company-grants.test-fixture';

/** The overview Offer decision queue's read, refused on demand by a test server. */
export const offerDecisionQueuePath = '/api/offer-decision-queue';

/** Adds only the grants that mount the Offer decision queue on the overview. */
export function withOfferDecisionQueue(actor: ActorContext): ActorContext {
  const company = actor.activeCompany;
  if (!company)
    throw new Error('The Offer decision queue needs an active Company.');
  return {
    ...actor,
    activeCompany: {
      ...company,
      commercialIntakePermissions: [
        'commercial.request.read',
        'commercial.opportunity.read',
      ],
      commercialIntakePermissionAssignmentId: 'overview-queue-intake',
      commercialIntakePermissionSetVersion: 'v1',
      offerPermissions: ['commercial.offer.read', 'commercial.offer.approve'],
      offerApproverAssignmentId: 'overview-queue-approver',
      offerApproverPermissionSetVersion: 'v1',
      grants: withCompanyGrants(
        withoutCompanyGrants(company?.grants, 'company_offer_preparer'),
        {
          bundle: 'company_commercial_intake',
          version: 'v1',
          assignmentId: 'overview-queue-intake',
        },
        {
          bundle: 'company_offer_approver',
          version: 'v1',
          assignmentId: 'overview-queue-approver',
        },
      ),
    },
  };
}

/**
 * Prisme mounts the overview owners only while no section is selected. A
 * refused refresh of the overview's Offer decision queue re-reads the Actor
 * while they all stay mounted. The test server refuses the next queue read in
 * `refuse`.
 */
export async function refuseOverviewQueueRefresh({
  refuse,
  actorReads,
}: {
  refuse: () => void;
  actorReads: () => number;
}) {
  const queue = await screen.findByRole('region', {
    name: 'Offers awaiting an internal decision',
  });
  const refresh = within(queue).getByRole('button', {
    name: 'Refresh from beginning',
  });
  await waitFor(() => expect(refresh).toBeEnabled());
  refuse();
  const before = actorReads();
  fireEvent.click(refresh);
  await waitFor(() => expect(actorReads()).toBeGreaterThan(before));
}
