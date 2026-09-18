import { createClerkClient } from '@clerk/backend';
import type { AcceptanceGateway } from './clerk-invitation-acceptance.adapter.js';
import { identityConfiguration } from './identity-configuration.js';

export function acceptanceGateway(secretKey: string): AcceptanceGateway {
  const api = createClerkClient({ secretKey });
  const { publishableKey } = identityConfiguration();
  // Clerk's publishable key contains the configured FAPI host followed by "$".
  // This is server configuration, never a URL taken from the browser or ticket.
  const encoded = /^pk_(?:test|live)_([A-Za-z0-9+/=]+)$/u.exec(
    publishableKey,
  )?.[1];
  const decoded = encoded
    ? Buffer.from(encoded, 'base64').toString('utf8')
    : '';
  const host = decoded.endsWith('$') ? decoded.slice(0, -1) : '';
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/iu.test(host) || !host.includes('.'))
    throw new Error('Invalid Clerk frontend configuration.');
  const origin = 'https://' + host;
  return {
    list: (parameters) => api.invitations.getInvitationList(parameters),
    user: (id) => api.users.getUser(id),
    client: (id) => api.clients.getClient(id),
    async createClient() {
      const response = await fetch(origin + '/v1/client?_is_native=true', {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok)
        throw new Error('Invitation proof initialization failed.');
      const body: unknown = await response.json();
      const token = response.headers
        .get('authorization')
        ?.replace(/^Bearer /iu, '');
      if (
        typeof body !== 'object' ||
        body === null ||
        !('response' in body) ||
        typeof body.response !== 'object' ||
        body.response === null ||
        !('id' in body.response)
      )
        throw new Error('Malformed Clerk client.');
      return { id: body.response.id, token };
    },
    async exchange({ token, ticket }) {
      const response = await fetch(
        origin + '/v1/client/sign_ins?_is_native=true',
        {
          method: 'POST',
          signal: AbortSignal.timeout(10_000),
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ strategy: 'ticket', ticket }),
        },
      );
      // Identity comes only from BAPI readback of the previously persisted client.
      await response.arrayBuffer();
      if (!response.ok)
        throw new Error('Invitation exchange could not be confirmed.');
    },
  };
}
