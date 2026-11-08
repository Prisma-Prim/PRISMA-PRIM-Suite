import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { useInterfaceLocale } from '../localization/interface-locale';
import { CertificationWorkspace } from './CertificationWorkspace';
import {
  FakeCertificationServer,
  certificationActor,
  certificationIdentity,
  certificationIds,
} from './certification.test-fixture';

const REGISTER_PDF = 'Dossier register PDF';
const DOWNLOAD = 'Download the dossier register (PDF)';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

/** Switches the interface language the way the shell's language menu does. */
function FrenchSwitch() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <button type="button" onClick={() => changeLocale('fr')}>
      Français
    </button>
  );
}

function renderReader() {
  const actor = certificationActor({ manager: false });
  return render(
    <>
      <FrenchSwitch />
      <CertificationWorkspace
        actor={actor}
        identity={certificationIdentity}
        projectId={certificationIds.project}
      />
    </>,
  );
}

function readerServer() {
  return new FakeCertificationServer({
    actor: () => certificationActor({ manager: false }),
  });
}

async function openSeededCase(reference: string) {
  fireEvent.click(await screen.findByRole('button', { name: reference }));
  return screen.findByRole('heading', {
    name: `Certification Case ${reference}`,
  });
}

function installDownload() {
  const saved: { name: string; bytes: Promise<string> }[] = [];
  const blobs = new Map<string, Blob>();
  const created = vi.fn((blob: Blob) => {
    const url = `blob:fictional-register-${blobs.size + 1}`;
    blobs.set(url, blob);
    return url;
  });
  const revoked = vi.fn();
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(function (this: HTMLAnchorElement) {
      const blob = blobs.get(this.href);
      saved.push({
        name: this.download,
        bytes: blob ? blob.text() : Promise.resolve(''),
      });
    });
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: created,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: revoked,
  });
  return { saved, revoked, click };
}

function registerReads(server: FakeCertificationServer) {
  return server.requests.filter((request) =>
    request.path.endsWith('/register'),
  );
}

describe('Certification dossier register PDF', () => {
  it('lets a reader download the register in the interface language without any command', async () => {
    const server = readerServer();
    const caseId = server.seed({
      orderReference: 'CERT-REGISTER-READ',
      duration: true,
    });
    server.install();
    const download = installDownload();
    renderReader();
    await openSeededCase('CERT-REGISTER-READ');

    const panel = screen.getByRole('region', { name: REGISTER_PDF });
    expect(
      within(panel).getByText(
        'A generated PDF listing every step version and every referenced Document Version of this Case, in the interface language. It is not an official certification body form and replaces none of the signed originals.',
      ),
    ).toBeVisible();
    // The reader sees the register's download, yet no form or command.
    expect(
      screen.getByText(
        'You can consult this Case. Recording a step requires Company Certification Programme Manager.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    const button = within(panel).getByRole('button', { name: DOWNLOAD });
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    await waitFor(() => expect(download.click).toHaveBeenCalledOnce());
    const prefix = caseId.slice(0, 8);
    expect(download.saved.map((entry) => entry.name)).toEqual([
      `certification-case-register-${prefix}.pdf`,
    ]);
    expect(await download.saved[0]?.bytes).toContain(
      'Fictional dossier register of CERT-REGISTER-READ',
    );
    expect(download.revoked).toHaveBeenCalledWith('blob:fictional-register-1');
    expect(registerReads(server)).toEqual([
      expect.objectContaining({
        method: 'GET',
        path: `/api/certification-cases/${caseId}/register`,
        search: '?language=en',
        company: certificationIds.company,
        key: null,
      }),
    ]);
    expect(within(panel).queryByRole('status')).not.toBeInTheDocument();

    // The same Case in French asks for the French register.
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    const french = within(
      screen.getByRole('region', { name: 'Registre du dossier en PDF' }),
    ).getByRole('button', { name: 'Télécharger le registre du dossier (PDF)' });
    fireEvent.click(french);
    await waitFor(() => expect(download.click).toHaveBeenCalledTimes(2));
    expect(await download.saved[1]?.bytes).toContain('(fr)');
    expect(registerReads(server).at(-1)?.search).toBe('?language=fr');
    expect(server.requests.some((request) => request.method !== 'GET')).toBe(
      false,
    );
  });

  it('saves nothing when the reply is not a PDF or the Case is gone, and says so', async () => {
    const server = readerServer();
    server.seed({ orderReference: 'CERT-REGISTER-FAIL', duration: true });
    server.install();
    const download = installDownload();
    renderReader();
    await openSeededCase('CERT-REGISTER-FAIL');
    const panel = screen.getByRole('region', { name: REGISTER_PDF });

    server.interceptions.push({
      match: (request) => request.path.endsWith('/register'),
      respond: () =>
        new Response('<html>Fictional proxy page</html>', {
          headers: { 'content-type': 'text/html' },
        }),
    });
    fireEvent.click(within(panel).getByRole('button', { name: DOWNLOAD }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      'The dossier register could not be downloaded. Try again.',
    );

    // A PDF content type does not make other bytes a PDF.
    server.interceptions.push({
      match: (request) => request.path.endsWith('/register'),
      respond: () =>
        new Response('Fictional bytes', {
          headers: { 'content-type': 'application/pdf' },
        }),
    });
    fireEvent.click(within(panel).getByRole('button', { name: DOWNLOAD }));
    await waitFor(() => expect(registerReads(server)).toHaveLength(2));
    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      'The dossier register could not be downloaded. Try again.',
    );

    server.interceptions.push({
      match: (request) => request.path.endsWith('/register'),
      respond: () => new Response(null, { status: 404 }),
    });
    fireEvent.click(within(panel).getByRole('button', { name: DOWNLOAD }));
    expect(
      await within(panel).findByText(
        'The dossier register of this Case is unavailable. Reload the Case.',
      ),
    ).toHaveAttribute('role', 'alert');
    expect(download.click).not.toHaveBeenCalled();
    expect(registerReads(server)).toHaveLength(3);
  });
});
