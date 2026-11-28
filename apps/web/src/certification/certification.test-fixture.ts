import { vi } from 'vitest';
import type { BrowserIdentity } from '../access-composition';
import { FakeCertificationServer as CertificationFakeServer } from './certification-fake-server';

// The fictional Certification contract lives in a module without Vitest, so
// a browser journey can serve it too (#1538); the tests' stubs stay here.
export * from './certification-fake-server';

/** The fictional Certification server, answering the tests' `fetch`. */
export class FakeCertificationServer extends CertificationFakeServer {
  install() {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        this.fetch(input, init),
      ),
    );
  }
}

export const certificationIdentity: BrowserIdentity = {
  loaded: true,
  signedIn: true,
  getToken: async () => 'token',
  rejectSession: vi.fn(async () => undefined),
  signOut: async () => undefined,
  signedOutView: null,
};
