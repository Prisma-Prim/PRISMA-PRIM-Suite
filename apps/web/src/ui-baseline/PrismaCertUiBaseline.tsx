import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  ContactRound,
  Download,
  Edit3,
  Eye,
  FileCheck2,
  FilePlus2,
  FileSearch,
  FileText,
  Filter,
  FolderKanban,
  Gauge,
  History,
  Inbox,
  Languages,
  LayoutDashboard,
  Link2,
  ListChecks,
  LockKeyhole,
  Mail,
  Menu,
  MoreHorizontal,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  UserRoundPlus,
  UsersRound,
  X,
  XCircle,
} from 'lucide-react';
import {
  baseFields,
  coverageRows,
  fructFields,
  requests,
  stages,
  type AnalysisState,
  type RequestItem,
  type ReviewField,
  type Stage,
  type Tone,
} from './prisma-data';
import { prismaLogoDataUrl } from './prisma-logo';
import './prisma-cert-ui-baseline.css';

type PageId =
  | 'dashboard'
  | 'requests'
  | 'request'
  | 'clients'
  | 'offers'
  | 'contracts'
  | 'projects'
  | 'documents'
  | 'catalog'
  | 'activity'
  | 'users'
  | 'coverage';
type ModalKind =
  | 'create'
  | 'field'
  | 'client'
  | 'acceptance'
  | 'signature'
  | 'document'
  | 'catalog'
  | 'invite'
  | 'event'
  | 'assistant'
  | 'search'
  | 'help'
  | 'notifications'
  | 'account'
  | 'case'
  | 'confirm';
type ModalState = { kind: ModalKind; data?: string } | null;
type Locale = 'fr' | 'ro';

const nav = [
  {
    label: 'Pilotage',
    items: [
      ['dashboard', 'Vue d’ensemble', LayoutDashboard],
      ['requests', 'Demandes', Inbox],
      ['clients', 'Clients & contacts', ContactRound],
      ['offers', 'Offres', FileCheck2],
      ['contracts', 'Contrats', ClipboardCheck],
      ['projects', 'Projets', FolderKanban],
    ],
  },
  {
    label: 'Connaissance',
    items: [
      ['documents', 'Documents & RAG', BookOpen],
      ['catalog', 'Services & tarifs', BriefcaseBusiness],
      ['activity', 'Journal d’audit', History],
    ],
  },
  {
    label: 'Configuration',
    items: [
      ['users', 'Utilisateurs', UsersRound],
      ['coverage', 'Couverture MVP', ShieldCheck],
    ],
  },
] as const;

const ro: Record<string, string> = {
  'Vue d’ensemble': 'Prezentare generală',
  Demandes: 'Solicitări',
  'Clients & contacts': 'Clienți și contacte',
  Offres: 'Oferte',
  Contrats: 'Contracte',
  Projets: 'Proiecte',
  'Documents & RAG': 'Documente și RAG',
  'Services & tarifs': 'Servicii și tarife',
  'Journal d’audit': 'Jurnal de audit',
  Utilisateurs: 'Utilizatori',
  'Couverture MVP': 'Acoperire MVP',
  'Nouvelle demande': 'Solicitare nouă',
  'Interroger PRISMA': 'Întreabă PRISMA',
  'Recherche globale': 'Căutare globală',
  Ouvrir: 'Deschide',
  Enregistrer: 'Salvează',
};

const pageLabels: Record<PageId, string> = {
  dashboard: 'Vue d’ensemble',
  requests: 'Demandes',
  request: 'Dossier',
  clients: 'Clients & contacts',
  offers: 'Offres',
  contracts: 'Contrats',
  projects: 'Projets',
  documents: 'Documents & RAG',
  catalog: 'Services & tarifs',
  activity: 'Journal d’audit',
  users: 'Utilisateurs',
  coverage: 'Couverture MVP',
};

const offersSeed = [
  {
    id: 'OFR-2026-142',
    client: 'AgroNova SRL',
    version: 'v2',
    status: 'sent',
    label: 'Envoyée',
    tone: 'info' as Tone,
    total: '8 424,60 €',
    source: 'CAL-0281-03',
  },
  {
    id: 'OFR-2026-139',
    client: 'Purcari Wineries',
    version: 'v3',
    status: 'accepted',
    label: 'Acceptée',
    tone: 'success' as Tone,
    total: '4 800,00 €',
    source: 'CAL-0278-02',
  },
  {
    id: 'OFR-2026-145',
    client: 'Codru Foods',
    version: 'v1',
    status: 'qa_failed',
    label: 'QA échouée',
    tone: 'danger' as Tone,
    total: '6 190,00 €',
    source: 'CAL-0284-01',
  },
  {
    id: 'OFR-2026-141',
    client: 'Nord Audit',
    version: 'v2',
    status: 'pending_approval',
    label: 'À approuver',
    tone: 'warning' as Tone,
    total: '3 240,00 €',
    source: 'CAL-0277-03',
  },
  {
    id: 'OFR-2026-134',
    client: 'Orhei Logistic',
    version: 'v1',
    status: 'superseded',
    label: 'Remplacée',
    tone: 'neutral' as Tone,
    total: '2 980,00 €',
    source: 'CAL-0270-01',
  },
  {
    id: 'OFR-2026-132',
    client: 'Dacia Retail',
    version: 'v1',
    status: 'expired',
    label: 'Expirée',
    tone: 'warning' as Tone,
    total: '2 460,00 €',
    source: 'CAL-0268-01',
  },
];

const contractsSeed = [
  {
    id: 'CTR-2026-096',
    client: 'Purcari Wineries',
    version: 'v1',
    offer: 'OFR-2026-139 v3',
    status: 'signed',
    label: 'Signé',
    tone: 'success' as Tone,
    total: '4 800,00 €',
  },
  {
    id: 'CTR-2026-099',
    client: 'Codru Foods',
    version: 'v2',
    offer: 'OFR-2026-145 v2',
    status: 'qa_failed',
    label: 'QA échouée',
    tone: 'danger' as Tone,
    total: '6 190,00 €',
  },
  {
    id: 'CTR-2026-094',
    client: 'Nord Audit',
    version: 'v1',
    offer: 'OFR-2026-137 v2',
    status: 'approved',
    label: 'Approuvé',
    tone: 'info' as Tone,
    total: '3 240,00 €',
  },
  {
    id: 'CTR-2026-088',
    client: 'Orhei Logistic',
    version: 'v1',
    offer: 'OFR-2026-128 v1',
    status: 'superseded',
    label: 'Remplacé',
    tone: 'neutral' as Tone,
    total: '2 980,00 €',
  },
];

const auditSeed = [
  [
    '15:06',
    'Indexation reprise',
    'DOC-0441 v2 indexé après remplacement du fichier',
    'Elena Rusu',
    'Document',
  ],
  [
    '14:42',
    'Contrat signé',
    'CTR-2026-096 v1 · preuve SIG-7712',
    'Dan Popescu',
    'Contrat',
  ],
  [
    '13:28',
    'Offre acceptée',
    'OFR-2026-139 v3 · email MSG-9021',
    'Dan Popescu',
    'Offre',
  ],
  [
    '11:16',
    'Snapshot créé',
    'CAL-0281-03 · 8 424,60 € TTC',
    'Dan Popescu',
    'Calcul',
  ],
  [
    '10:18',
    'Donnée corrigée',
    'REQ-0281 · nombre de sites : 3 → 2',
    'Dan Popescu',
    'Revue',
  ],
  [
    '09:54',
    'Analyse remplacée',
    'ANA-0281-01 → ANA-0281-02 · pipeline extract-v1.8',
    'Système',
    'IA',
  ],
  [
    '09:11',
    'Tarif activé',
    'TAR-HACCP-2026 v4 · validité 15/08–31/12',
    'Irina Ceban',
    'Tarif',
  ],
] as const;

function routeInfo() {
  if (typeof window === 'undefined')
    return {
      path: '/dashboard',
      parts: ['dashboard'],
      query: new URLSearchParams(),
    };
  const raw = window.location.hash.replace(/^#/, '') || '/dashboard';
  const [path, search = ''] = raw.split('?');
  return {
    path,
    parts: path.split('/').filter(Boolean),
    query: new URLSearchParams(search),
  };
}

function money(value: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(value);
}
function initials(name: string) {
  return name
    .split(' ')
    .map((x) => x[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
function workflowLabel(value: string) {
  return (
    (
      {
        draft: 'Brouillon',
        qa_failed: 'QA échouée',
        pending_approval: 'À approuver',
        approved: 'Approuvé',
        sent: 'Envoyé',
        accepted: 'Accepté',
        rejected: 'Rejeté',
        expired: 'Expiré',
        signed: 'Signé',
        superseded: 'Remplacé',
      } as Record<string, string>
    )[value] || value
  );
}

function Status({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return <span className={`status ${tone}`}>{children}</span>;
}
function Button({
  children,
  kind = 'secondary',
  onClick,
  disabled,
  type = 'button',
  ariaLabel,
}: {
  children: ReactNode;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  ariaLabel?: string;
}) {
  return (
    <button
      type={type}
      className={`btn ${kind}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}
function Surface({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`surface ${className}`}>{children}</section>;
}
function Heading({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <small>{eyebrow}</small>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </header>
  );
}
function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <FileSearch size={34} />
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}

// The original supplied logo is already optimized and must remain visually exact.
function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`brand brand-logo-card ${compact ? 'brand-compact' : ''}`}
      aria-label="PRISMA Prim"
    >
      <img src={prismaLogoDataUrl} alt="" aria-hidden="true" />
    </div>
  );
}

function Sidebar({
  page,
  compact,
  setCompact,
  go,
  locale,
  mobileOpen = false,
  closeMobile = () => {},
}: {
  page: PageId;
  compact: boolean;
  setCompact: (v: boolean) => void;
  go: (p: string) => void;
  locale: Locale;
  mobileOpen?: boolean;
  closeMobile?: () => void;
}) {
  const t = (s: string) => (locale === 'ro' ? ro[s] || s : s);
  const navigate = (path: string) => {
    go(path);
    closeMobile();
  };
  return (
    <>
      <button
        className={`sidebar-scrim ${mobileOpen ? 'visible' : ''}`}
        onClick={closeMobile}
        aria-label="Fermer la navigation"
        tabIndex={mobileOpen ? 0 : -1}
      />
      <aside
        className={`sidebar ${compact ? 'compact' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
      >
        <div className="brand-row">
          <Brand compact={compact} />
          <button
            onClick={() => setCompact(!compact)}
            aria-label={
              compact ? 'Déployer la navigation' : 'Réduire la navigation'
            }
          >
            {compact ? <ChevronRight /> : <ChevronLeft />}
          </button>
          <button
            className="mobile-close"
            onClick={closeMobile}
            aria-label="Fermer la navigation"
          >
            <X />
          </button>
        </div>
        <div className="workspace">
          <span>PC</span>
          <div>
            <small>ESPACE UNIQUE</small>
            <b>PRISMA Consultant</b>
          </div>
        </div>
        <nav aria-label="Navigation principale">
          {nav.map((group) => (
            <section key={group.label}>
              <small>{group.label}</small>
              {group.items.map(([id, label, Icon]) => (
                <button
                  key={id}
                  className={
                    page === id || (page === 'request' && id === 'requests')
                      ? 'active'
                      : ''
                  }
                  aria-current={page === id ? 'page' : undefined}
                  onClick={() => navigate(`/${id}`)}
                  title={compact ? t(label) : undefined}
                >
                  <Icon size={19} />
                  <span>{t(label)}</span>
                  {id === 'requests' && <em>3</em>}
                </button>
              ))}
            </section>
          ))}
        </nav>
        <div className="daily">
          <small>FILE DU JOUR</small>
          <b>5 / 8 actions traitées</b>
          <div>
            <span />
          </div>
          <p>
            <AlertTriangle size={15} /> 2 blocages métier
          </p>
        </div>
      </aside>
    </>
  );
}

function Topbar({
  context,
  open,
  locale,
  setLocale,
  openMobile,
}: {
  context: string;
  open: (kind: ModalKind, data?: string) => void;
  locale: Locale;
  setLocale: (l: Locale) => void;
  openMobile: () => void;
}) {
  const t = (s: string) => (locale === 'ro' ? ro[s] || s : s);
  return (
    <header className="topbar">
      <button
        className="mobile-menu"
        onClick={openMobile}
        aria-label="Ouvrir la navigation"
      >
        <Menu />
      </button>
      <div className="breadcrumb">
        <span>PRISMA Consultant</span>
        <ChevronRight size={15} />
        <b>{context}</b>
      </div>
      <div className="top-actions">
        <button className="search-trigger" onClick={() => open('search')}>
          <Search size={17} />
          <span>{t('Recherche globale')}</span>
          <kbd>Ctrl K</kbd>
        </button>
        <span className="demo">
          <i /> Données de démonstration
        </span>
        <div className="locale" aria-label="Langue de l’interface">
          <button
            className={locale === 'fr' ? 'active' : ''}
            onClick={() => setLocale('fr')}
          >
            FR
          </button>
          <button
            className={locale === 'ro' ? 'active' : ''}
            onClick={() => setLocale('ro')}
          >
            RO
          </button>
        </div>
        <button
          className="icon-btn"
          aria-label="Aide"
          onClick={() => open('help')}
        >
          <CircleHelp size={19} />
        </button>
        <button
          className="icon-btn notification"
          aria-label="3 notifications"
          onClick={() => open('notifications')}
        >
          <Bell size={19} />
          <i>3</i>
        </button>
        <Button kind="primary" onClick={() => open('assistant')}>
          <Sparkles size={17} />
          {t('Interroger PRISMA')}
        </Button>
        <button
          className="avatar"
          aria-label="Compte de Dan Popescu"
          onClick={() => open('account')}
        >
          DP
        </button>
      </div>
    </header>
  );
}

function Dashboard({
  go,
  open,
}: {
  go: (p: string) => void;
  open: (k: ModalKind, d?: string) => void;
}) {
  const kpis = [
    [
      'Demandes par statut',
      '12',
      '3 analyse · 2 revue · 4 offre · 3 clôturées',
      Inbox,
      'info',
    ],
    [
      'Offres par statut',
      '7',
      '2 brouillons · 2 à approuver · 3 acceptées',
      FileCheck2,
      'warning',
    ],
    [
      'Contrats générés',
      '5',
      '3 signés · 1 approuvé · 1 QA',
      ClipboardCheck,
      'success',
    ],
    [
      'Temps moyen du flux',
      '27 min',
      'référence manuelle 71 min · 12 dossiers',
      Clock3,
      'success',
    ],
  ] as const;
  return (
    <div className="page">
      <Heading
        eyebrow="SAMEDI 15 AOÛT 2026 · PILOTE"
        title="Décisions et performance"
        subtitle="Une vue mesurée du travail réel, des blocages et des résultats du pilote."
        action={
          <Button kind="primary" onClick={() => open('create')}>
            <Plus size={17} /> Nouvelle demande
          </Button>
        }
      />
      <div className="action-banner">
        <span>
          <ListChecks />
        </span>
        <div>
          <small>PROCHAINE ACTION RECOMMANDÉE</small>
          <h2>Résoudre les 2 champs critiques de Fruct Moldova</h2>
          <p>
            Le nombre de sites est contradictoire et la date cible manque. Le
            calcul reste bloqué.
          </p>
          <b>
            <Clock3 size={15} /> Échéance aujourd’hui à 15:00 · environ 4
            minutes
          </b>
        </div>
        <Status tone="danger">2 blocages</Status>
        <Button
          kind="primary"
          onClick={() => go('/request/REQ-0280/validation')}
        >
          Ouvrir la revue <ArrowRight size={16} />
        </Button>
      </div>
      <div className="metrics">
        {kpis.map(([label, value, note, Icon, tone]) => (
          <article className="metric" key={label}>
            <span className={tone}>
              <Icon />
            </span>
            <div>
              <small>{label}</small>
              <strong>{value}</strong>
              <p>{note}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="dashboard-grid">
        <Surface className="queue">
          <header>
            <div>
              <small>FILE DE TRAVAIL</small>
              <h2>Actions prioritaires</h2>
            </div>
            <button onClick={() => go('/requests')}>
              Toutes les demandes <ChevronRight size={16} />
            </button>
          </header>
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Action</th>
                <th>Échéance</th>
                <th>État</th>
                <th>
                  <span className="sr-only">Ouvrir</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {requests.slice(0, 3).map((r) => (
                <tr key={r.ref}>
                  <td>
                    <button
                      className="entity-link"
                      onClick={() => go(`/request/${r.ref}/${r.stage}`)}
                    >
                      <span>{initials(r.client)}</span>
                      <b>{r.client}</b>
                      <small>{r.ref}</small>
                    </button>
                  </td>
                  <td>{r.next}</td>
                  <td>{r.due}</td>
                  <td>
                    <Status tone={r.tone}>{r.status}</Status>
                  </td>
                  <td>
                    <button
                      className="row-open"
                      aria-label={`Ouvrir ${r.ref}`}
                      onClick={() => go(`/request/${r.ref}/${r.stage}`)}
                    >
                      <ChevronRight />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Surface>
        <Surface className="chart-card">
          <header>
            <div>
              <small>FLUX · 6 SEMAINES</small>
              <h2>Demandes et contrats</h2>
            </div>
            <BarChart3 />
          </header>
          <div
            className="chart"
            role="img"
            aria-label="Demandes : 9, 12, 11, 15, 14, 18. Contrats : 5, 7, 8, 9, 10, 11."
          >
            {[
              ['S27', 9, 5],
              ['S28', 12, 7],
              ['S29', 11, 8],
              ['S30', 15, 9],
              ['S31', 14, 10],
              ['S32', 18, 11],
            ].map(([w, a, b]) => (
              <div className="bar-group" key={w}>
                <div>
                  <span
                    style={{ height: `${Number(a) * 5}%` }}
                    title={`${a} demandes`}
                  />
                  <span
                    style={{ height: `${Number(b) * 5}%` }}
                    title={`${b} contrats`}
                  />
                </div>
                <small>{w}</small>
              </div>
            ))}
          </div>
          <div className="legend">
            <span>
              <i />
              Demandes
            </span>
            <span>
              <i />
              Contrats
            </span>
            <b>unités par semaine</b>
          </div>
          <details>
            <summary>Tableau accessible</summary>
            <table>
              <thead>
                <tr>
                  <th>Semaine</th>
                  <th>Demandes</th>
                  <th>Contrats</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['S27', 9, 5],
                  ['S28', 12, 7],
                  ['S29', 11, 8],
                  ['S30', 15, 9],
                  ['S31', 14, 10],
                  ['S32', 18, 11],
                ].map((x) => (
                  <tr key={x[0]}>
                    <td>{x[0]}</td>
                    <td>{x[1]}</td>
                    <td>{x[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Surface>
      </div>
      <Surface className="evaluation">
        <header>
          <div>
            <small>ÉVALUATION DU PILOTE</small>
            <h2>16 des 20 cas manuels comparés à PRISMA</h2>
          </div>
          <Button onClick={() => open('case', 'all')}>Voir les 20 cas</Button>
        </header>
        <div>
          {[
            [
              'Temps gagné',
              '62 %',
              '596 min économisées / 960 min de référence',
              Clock3,
            ],
            ['Extraction', '93 %', '268 champs exacts / 288 contrôlés', Bot],
            ['Calcul exact', '100 %', '16 résultats exacts / 16', Gauge],
            ['Traçabilité', '100 %', '16 dossiers complets / 16', History],
            [
              'Erreurs détectées',
              '9',
              '7 erreurs · 2 avertissements',
              AlertTriangle,
            ],
            ['Corrections humaines', '20', '20 valeurs corrigées / 288', Edit3],
          ].map(([a, b, c, Icon]) => (
            <button key={String(a)} onClick={() => open('case', String(a))}>
              <Icon />
              <small>{a as string}</small>
              <strong>{b as string}</strong>
              <span>{c as string}</span>
            </button>
          ))}
        </div>
      </Surface>
    </div>
  );
}

function RequestsPage({
  go,
  open,
}: {
  go: (p: string) => void;
  open: (k: ModalKind, d?: string) => void;
}) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [system, setSystem] = useState<'ready' | 'loading' | 'error'>('ready');
  const shown = requests.filter(
    (r) =>
      `${r.ref} ${r.client} ${r.service}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === 'all' ||
        filter === r.analysis ||
        filter === r.stage ||
        (filter === 'blocked' && r.blockers > 0)),
  );
  return (
    <div className="page">
      <Heading
        eyebrow="PIPELINE COMMERCIAL"
        title="Demandes clients"
        subtitle="États contractuels, blocages, échéances et prochaine action pour chaque dossier."
        action={
          <Button kind="primary" onClick={() => open('create')}>
            <Plus /> Nouvelle demande
          </Button>
        }
      />
      <div className="toolbar">
        <label>
          <Search />
          <span className="sr-only">Rechercher</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Client, référence ou service"
          />
        </label>
        <div className="segmented">
          {[
            ['all', 'Toutes'],
            ['blocked', 'Bloquées'],
            ['analysis', 'Analyse'],
            ['offer', 'Offre'],
            ['archive', 'Terminées'],
          ].map(([id, label]) => (
            <button
              className={filter === id ? 'active' : ''}
              onClick={() => setFilter(id)}
              key={id}
            >
              {label}
            </button>
          ))}
        </div>
        <Button
          onClick={() =>
            setSystem(
              system === 'ready'
                ? 'loading'
                : system === 'loading'
                  ? 'error'
                  : 'ready',
            )
          }
        >
          <Settings2 /> États système
        </Button>
      </div>
      {system === 'loading' ? (
        <Surface>
          <div className="loading">
            <RefreshCw className="spin" />
            <b>Chargement des demandes…</b>
          </div>
        </Surface>
      ) : system === 'error' ? (
        <Surface>
          <Empty
            title="Les demandes ne peuvent pas être chargées"
            text="La dernière synchronisation a échoué. Les données existantes n’ont pas été modifiées."
            action={
              <Button onClick={() => setSystem('ready')}>
                <RefreshCw /> Réessayer
              </Button>
            }
          />
        </Surface>
      ) : (
        <Surface className="data-table">
          <table>
            <thead>
              <tr>
                <th>Client et demande</th>
                <th>Prochaine action</th>
                <th>Responsable</th>
                <th>Échéance</th>
                <th>État</th>
                <th>
                  <span className="sr-only">Ouvrir</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.ref}>
                  <td>
                    <button
                      className="entity-link"
                      onClick={() => go(`/request/${r.ref}/${r.stage}`)}
                    >
                      <span>{initials(r.client)}</span>
                      <b>{r.client}</b>
                      <small>
                        {r.ref} · {r.service} · {r.language}
                      </small>
                    </button>
                  </td>
                  <td>
                    <b>{r.next}</b>
                    <small>
                      {r.blockers
                        ? `${r.blockers} point(s) bloquant(s)`
                        : 'Aucun blocage'}
                    </small>
                  </td>
                  <td>{r.owner}</td>
                  <td>{r.due}</td>
                  <td>
                    <Status tone={r.tone}>{r.status}</Status>
                  </td>
                  <td>
                    <button
                      className="row-open"
                      onClick={() => go(`/request/${r.ref}/${r.stage}`)}
                      aria-label={`Ouvrir ${r.ref}`}
                    >
                      <ChevronRight />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && (
            <Empty
              title="Aucune demande"
              text="Retirez un filtre ou modifiez la recherche."
            />
          )}
        </Surface>
      )}
    </div>
  );
}

function Stepper({
  current,
  request,
  go,
}: {
  current: Stage;
  request: RequestItem;
  go: (p: string) => void;
}) {
  const currentIndex = stages.findIndex((s) => s.id === request.stage);
  return (
    <Surface className="stepper">
      <header>
        <div>
          <small>ÉTAT RÉEL DU DOSSIER</small>
          <b>
            {request.status} · prochaine action : {request.next}
          </b>
        </div>
        <Status tone={request.tone}>
          {stages.find((s) => s.id === request.stage)?.label}
        </Status>
      </header>
      <div>
        {stages.map((s, i) => (
          <button
            key={s.id}
            className={`${i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'next'} ${current === s.id ? 'viewing' : ''}`}
            onClick={() => go(`/request/${request.ref}/${s.id}`)}
          >
            <span>{i < currentIndex ? <Check /> : i + 1}</span>
            <b>{s.label}</b>
          </button>
        ))}
      </div>
      <footer>
        <Eye /> Étape consultée :{' '}
        <b>{stages.find((s) => s.id === current)?.label}</b>. Consulter une
        étape ne change pas l’état réel.
      </footer>
    </Surface>
  );
}

function IntakePanel({
  request,
  open,
}: {
  request: RequestItem;
  open: (k: ModalKind, d?: string) => void;
}) {
  return (
    <div className="two-col">
      <Surface>
        <header>
          <div>
            <small>DEMANDE SOURCE</small>
            <h2>
              {request.client} · {request.service}
            </h2>
          </div>
          <Status tone="success">Import validé</Status>
        </header>
        <dl className="facts">
          <div>
            <dt>Canal</dt>
            <dd>Email + 2 pièces</dd>
          </div>
          <div>
            <dt>Langue</dt>
            <dd>{request.language}</dd>
          </div>
          <div>
            <dt>Responsable</dt>
            <dd>{request.owner}</dd>
          </div>
          <div>
            <dt>Créée</dt>
            <dd>15 août 2026 · 08:42</dd>
          </div>
        </dl>
        <div className="doc-list">
          <button onClick={() => open('document', 'DOC-0440')}>
            <FileText />
            <span>
              <b>Email_client.eml</b>
              <small>Original · sha256 vérifié</small>
            </span>
            <Status tone="success">Lisible</Status>
          </button>
          <button onClick={() => open('document', 'DOC-0441')}>
            <FileText />
            <span>
              <b>Cahier_des_besoins.docx</b>
              <small>Version 2 · 1,2 Mo</small>
            </span>
            <Status tone="success">Lisible</Status>
          </button>
        </div>
      </Surface>
      <Surface className="side-card">
        <small>INTÉGRITÉ</small>
        <h2>Contrôles d’import</h2>
        <p>
          <CheckCircle2 /> Type et taille autorisés
        </p>
        <p>
          <CheckCircle2 /> Empreinte enregistrée
        </p>
        <p>
          <CheckCircle2 /> Aucun doublon détecté
        </p>
        <p>
          <CheckCircle2 /> Original conservé
        </p>
        <Button onClick={() => open('create')}>
          Voir les erreurs d’import
        </Button>
      </Surface>
    </div>
  );
}

const analysisCopy: Record<
  AnalysisState,
  { title: string; text: string; tone: Tone; action?: string }
> = {
  pending: {
    title: 'Analyse en attente',
    text: 'Exécution ANA-0279-03 dans la file. Aucun résultat disponible.',
    tone: 'neutral',
    action: 'Annuler',
  },
  running: {
    title: 'Analyse en cours',
    text: 'Lecture des documents et extraction structurée. Étape courante : rapprochement des preuves.',
    tone: 'info',
    action: 'Actualiser',
  },
  completed: {
    title: 'Analyse terminée',
    text: '18 champs extraits. Les incertitudes sont transmises à la revue humaine.',
    tone: 'success',
    action: 'Créer une nouvelle analyse',
  },
  partial: {
    title: 'Résultat partiel',
    text: 'Quatre pages sont illisibles. Les champs concernés restent inconnus, sans valeur inventée.',
    tone: 'warning',
    action: 'Remplacer le fichier',
  },
  failed: {
    title: 'Analyse échouée',
    text: 'Le PDF est protégé par mot de passe. Erreur DOC_PASSWORD · aucune donnée partielle retenue.',
    tone: 'danger',
    action: 'Remplacer puis relancer',
  },
  superseded: {
    title: 'Analyse remplacée',
    text: 'ANA-0281-01 a été remplacée par ANA-0281-02 après correction. Elle reste consultable.',
    tone: 'neutral',
    action: 'Voir l’exécution active',
  },
};

function AnalysisPanel({
  request,
  state,
  setState,
  notify,
}: {
  request: RequestItem;
  state: AnalysisState;
  setState: (s: AnalysisState) => void;
  notify: (s: string) => void;
}) {
  const c = analysisCopy[state];
  const act = () => {
    if (state === 'failed' || state === 'partial' || state === 'pending') {
      setState('running');
      notify(
        'Nouvelle analyse lancée. L’ancienne exécution reste dans le journal.',
      );
    } else if (state === 'running') {
      setState('completed');
      notify('Analyse terminée : 18 champs transmis à la revue.');
    } else if (state === 'completed') {
      setState('superseded');
      notify('Une nouvelle version d’analyse a été créée.');
    } else setState('completed');
  };
  return (
    <div>
      <div className="scenario-strip">
        <b>Scénarios de démonstration</b>
        {(Object.keys(analysisCopy) as AnalysisState[]).map((k) => (
          <button
            key={k}
            className={state === k ? 'active' : ''}
            onClick={() => setState(k)}
          >
            {analysisCopy[k].title.replace('Analyse ', '')}
          </button>
        ))}
      </div>
      <div className={`state-banner ${c.tone}`}>
        <span>
          {c.tone === 'danger' ? (
            <XCircle />
          ) : c.tone === 'warning' ? (
            <AlertTriangle />
          ) : c.tone === 'success' ? (
            <CheckCircle2 />
          ) : (
            <Bot />
          )}
        </span>
        <div>
          <b>{c.title}</b>
          <p>{c.text}</p>
        </div>
        {c.action && (
          <Button onClick={act}>
            <RefreshCw />
            {c.action}
          </Button>
        )}
      </div>
      <div className="two-col">
        <Surface>
          <header>
            <div>
              <small>EXÉCUTION ACTIVE</small>
              <h2>ANA-{request.ref.replace('REQ-', '')}-03</h2>
            </div>
            <Status tone={c.tone}>{c.title}</Status>
          </header>
          <dl className="facts">
            <div>
              <dt>Modèle</dt>
              <dd>gpt-extract-2026-07</dd>
            </div>
            <div>
              <dt>Pipeline</dt>
              <dd>extract-v1.8</dd>
            </div>
            <div>
              <dt>Prompt</dt>
              <dd>prisma-intake-v12</dd>
            </div>
            <div>
              <dt>Durée</dt>
              <dd>{state === 'running' ? 'En cours · 38 s' : '1 min 42 s'}</dd>
            </div>
            <div>
              <dt>Corpus</dt>
              <dd>2 documents · 14 pages</dd>
            </div>
            <div>
              <dt>Créée par</dt>
              <dd>{request.owner} · 15/08 09:54</dd>
            </div>
          </dl>
        </Surface>
        <Surface className="side-card">
          <small>HISTORIQUE DES EXÉCUTIONS</small>
          <h2>Traçabilité reproductible</h2>
          <button onClick={() => setState('superseded')}>
            <History />
            <span>
              <b>ANA-01 · remplacée</b>
              <small>pipeline v1.7 · 09:32</small>
            </span>
          </button>
          <button onClick={() => setState('completed')}>
            <CheckCircle2 />
            <span>
              <b>ANA-02 · terminée</b>
              <small>pipeline v1.8 · 09:54</small>
            </span>
          </button>
        </Surface>
      </div>
    </div>
  );
}

function ReviewPanel({
  fields,
  open,
  go,
  notify,
}: {
  fields: ReviewField[];
  open: (k: ModalKind, d?: string) => void;
  go: (p: string) => void;
  notify: (s: string) => void;
}) {
  const [filter, setFilter] = useState('all');
  const shown = fields.filter((f) => filter === 'all' || f.state === filter);
  const blockers = fields.filter(
    (f) =>
      f.critical &&
      (!f.retained || f.state === 'missing' || f.state === 'conflict'),
  );
  const labels: Record<ReviewField['state'], string> = {
    confirmed: 'Confirmé',
    inferred: 'Déduit',
    missing: 'Manquant',
    conflict: 'Contradictoire',
    corrected: 'Corrigé',
  };
  const tones: Record<ReviewField['state'], Tone> = {
    confirmed: 'success',
    inferred: 'info',
    missing: 'danger',
    conflict: 'warning',
    corrected: 'info',
  };
  return (
    <div>
      <div className="review-summary">
        <div>
          <b>18</b>
          <span>champs contrôlés</span>
        </div>
        <div>
          <b>{fields.filter((f) => f.state === 'confirmed').length}</b>
          <span>confirmés</span>
        </div>
        <div>
          <b>{fields.filter((f) => f.state === 'inferred').length}</b>
          <span>déduits</span>
        </div>
        <div className={blockers.length ? 'danger' : 'success'}>
          <b>{blockers.length}</b>
          <span>critiques à résoudre</span>
        </div>
      </div>
      <div className="toolbar">
        <div className="segmented">
          {[
            ['all', 'Tous'],
            ['confirmed', 'Confirmés'],
            ['inferred', 'Déduits'],
            ['missing', 'Manquants'],
            ['conflict', 'Contradictoires'],
            ['corrected', 'Corrigés'],
          ].map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? 'active' : ''}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <Surface className="data-table review-table">
        <table>
          <thead>
            <tr>
              <th>Champ</th>
              <th>Proposition IA</th>
              <th>Preuve</th>
              <th>Valeur humaine retenue</th>
              <th>Décision</th>
              <th>Validation</th>
              <th>
                <span className="sr-only">Revoir</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((f) => (
              <tr key={f.id}>
                <td>
                  <b>{f.label}</b>
                  <small>{f.critical ? 'Critique' : 'Non critique'}</small>
                </td>
                <td>
                  {f.ai}
                  <small>
                    {f.confidence == null
                      ? 'Confiance indisponible'
                      : `Confiance ${f.confidence} %`}
                  </small>
                </td>
                <td>
                  <button
                    className="source-link"
                    onClick={() => open('document', f.source)}
                  >
                    {f.source}
                    <small>{f.fragment}</small>
                  </button>
                </td>
                <td>
                  {f.retained || <em>À compléter</em>}
                  <small>{f.rationale}</small>
                </td>
                <td>
                  <Status tone={tones[f.state]}>{labels[f.state]}</Status>
                </td>
                <td>
                  {f.reviewer ? (
                    <>
                      <b>{f.reviewer}</b>
                      <small>{f.reviewedAt}</small>
                    </>
                  ) : (
                    <span>Non validé</span>
                  )}
                </td>
                <td>
                  <button
                    className="row-open"
                    onClick={() => open('field', f.id)}
                    aria-label={`Revoir ${f.label}`}
                  >
                    <Edit3 />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Surface>
      <div className={`next-action ${blockers.length ? 'blocked' : 'ready'}`}>
        <span>{blockers.length ? <LockKeyhole /> : <CheckCircle2 />}</span>
        <div>
          <small>PROCHAINE ACTION</small>
          <b>
            {blockers.length
              ? `Calcul bloqué par ${blockers.length} champ(s) critique(s)`
              : 'Dossier prêt pour le calcul'}
          </b>
          <p>
            {blockers.length
              ? blockers.map((x) => x.label).join(' · ')
              : 'Les 18 champs possèdent une valeur humaine retenue et une preuve traçable.'}
          </p>
        </div>
        <Button
          kind="primary"
          disabled={blockers.length > 0}
          onClick={() => {
            notify('Revue déclarée prête. Ouverture du calcul déterministe.');
            go('/request/REQ-0280/pricing');
          }}
        >
          Passer au calcul <ArrowRight />
        </Button>
      </div>
    </div>
  );
}

function PricingPanel({ notify }: { notify: (s: string) => void }) {
  const [draft, setDraft] = useState(false);
  const [discount, setDiscount] = useState(5);
  const [reason, setReason] = useState('Fidélité client · périmètre groupé');
  const [approved, setApproved] = useState(false);
  const [snapshots, setSnapshots] = useState([
    'CAL-0281-01',
    'CAL-0281-02',
    'CAL-0281-03',
  ]);
  const subtotal = 7390;
  const discountValue = (subtotal * discount) / 100;
  const net = subtotal - discountValue;
  const vat = net * 0.2;
  const total = net + vat;
  const needsApproval = discount > 10;
  const create = () => {
    if (!reason.trim()) return notify('Le motif de remise est obligatoire.');
    if (needsApproval && !approved)
      return notify(
        'La remise dépasse 10 % : une approbation explicite est requise.',
      );
    setSnapshots((x) => [...x, 'CAL-0281-04']);
    setDraft(false);
    notify(`CAL-0281-04 créé et verrouillé : ${money(total)} TTC.`);
  };
  return (
    <div className="pricing-layout">
      <div>
        <div className="scope-note warning">
          <AlertTriangle />
          <p>
            <b>Données de démonstration :</b> aucun montant affiché ne constitue
            un tarif réel de PRISMA-PRIM/BIC.
          </p>
        </div>
        {draft && (
          <div className="state-banner warning">
            <span>
              <RotateCcw />
            </span>
            <div>
              <b>Nouveau snapshot en préparation</b>
              <p>
                Le snapshot CAL-0281-03 reste immuable. Toute modification
                créera CAL-0281-04.
              </p>
            </div>
          </div>
        )}
        <Surface className="pricing-card">
          <header>
            <div>
              <small>
                SNAPSHOT DÉTERMINISTE {draft ? 'EN PRÉPARATION' : 'VERROUILLÉ'}
              </small>
              <h2>
                {draft ? 'CAL-0281-04 · brouillon' : 'CAL-0281-03 · actif'}
              </h2>
            </div>
            <Status tone={draft ? 'warning' : 'success'}>
              {draft ? 'Non enregistré' : 'Immuable'}
            </Status>
          </header>
          <table>
            <thead>
              <tr>
                <th>Composant</th>
                <th>Version de règle</th>
                <th>Quantité</th>
                <th>Prix unitaire</th>
                <th>Total HT</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Diagnostic HACCP', 'TAR-HACCP v4', '2 jours', 1650, 3300],
                [
                  'Préparation ISO 22000',
                  'TAR-ISO22K v3',
                  '2 jours',
                  1450,
                  2900,
                ],
                ['Déplacement consultant', 'FRAIS-MD v2', '2 unités', 170, 340],
                ['Hébergement', 'FRAIS-MD v2', '2 nuits', 180, 360],
                ['Traduction roumain/russe', 'TRAD v1', '7 pages', 70, 490],
                ['Indemnités', 'FRAIS-MD v2', 'Inclus', 0, 0],
                ['Commission', 'COMM v1', 'Non applicable', 0, 0],
              ].map((x) => (
                <tr key={String(x[0])}>
                  <td>
                    <b>{x[0]}</b>
                  </td>
                  <td>{x[1]}</td>
                  <td>{x[2]}</td>
                  <td>{money(Number(x[3]))}</td>
                  <td>{money(Number(x[4]))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="totals">
            <div>
              <span>Sous-total HT</span>
              <b>{money(subtotal)}</b>
            </div>
            <div>
              <span>Remise {discount} %</span>
              <b>− {money(discountValue)}</b>
            </div>
            <div>
              <span>Total HT après remise</span>
              <b>{money(net)}</b>
            </div>
            <div>
              <span>TVA 20 % · TVA-MD v2</span>
              <b>{money(vat)}</b>
            </div>
            <div className="grand">
              <span>Total TTC</span>
              <b>{money(total)}</b>
            </div>
          </div>
          {draft && (
            <div className="discount-editor">
              <label>
                <span>Remise (%)</span>
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={discount}
                  onChange={(e) => {
                    setDiscount(Number(e.target.value));
                    setApproved(false);
                  }}
                />
              </label>
              <label>
                <span>Motif obligatoire</span>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              {needsApproval && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={approved}
                    onChange={(e) => setApproved(e.target.checked)}
                  />{' '}
                  J’approuve explicitement cette remise supérieure au seuil de
                  10 %.
                </label>
              )}
            </div>
          )}
          <footer>
            {draft ? (
              <>
                <Button
                  onClick={() => {
                    setDraft(false);
                    setDiscount(5);
                  }}
                >
                  Abandonner
                </Button>
                <Button kind="primary" onClick={create}>
                  <Save />
                  Créer et verrouiller CAL-0281-04
                </Button>
              </>
            ) : (
              <Button onClick={() => setDraft(true)}>
                <Edit3 />
                Modifier dans un nouveau snapshot
              </Button>
            )}
          </footer>
        </Surface>
      </div>
      <Surface className="snapshot-history">
        <header>
          <div>
            <small>HISTORIQUE</small>
            <h2>Snapshots de calcul</h2>
          </div>
        </header>
        {snapshots.map((s, i) => (
          <button
            key={s}
            className={i === snapshots.length - 1 ? 'active' : ''}
            onClick={() => notify(`${s} ouvert en lecture seule.`)}
          >
            <span>{i + 1}</span>
            <div>
              <b>{s}</b>
              <small>
                {i === 0
                  ? 'Initial · invalidé'
                  : i === 1
                    ? 'Correction sites · invalidé'
                    : i === 2
                      ? 'Actif · 8 424,60 €'
                      : 'Actif · nouveau calcul'}
              </small>
            </div>
            <Eye />
          </button>
        ))}
        <dl className="facts compact">
          <div>
            <dt>Devise</dt>
            <dd>EUR</dd>
          </div>
          <div>
            <dt>Arrondi</dt>
            <dd>2 décimales, demi au pair</dd>
          </div>
          <div>
            <dt>Auteur</dt>
            <dd>Dan Popescu</dd>
          </div>
          <div>
            <dt>Créé</dt>
            <dd>15/08/2026 · 11:16</dd>
          </div>
        </dl>
      </Surface>
    </div>
  );
}

function RequestPage({
  request,
  stage,
  analysis,
  setAnalysis,
  fields,
  open,
  go,
  notify,
}: {
  request: RequestItem;
  stage: Stage;
  analysis: AnalysisState;
  setAnalysis: (s: AnalysisState) => void;
  fields: ReviewField[];
  open: (k: ModalKind, d?: string) => void;
  go: (p: string) => void;
  notify: (s: string) => void;
}) {
  return (
    <div className="page">
      <div className="record-heading">
        <button onClick={() => go('/requests')}>
          <ArrowLeft />
          Demandes
        </button>
        <div>
          <span>
            {request.ref} · {request.language}
          </span>
          <h1>{request.client}</h1>
          <p>
            {request.service} · responsable {request.owner}
          </p>
        </div>
        <div>
          <Button onClick={() => open('event', request.ref)}>
            <History />
            Historique
          </Button>
          <Button
            onClick={() =>
              notify(
                `Export complet de ${request.ref} préparé avec preuves et journal.`,
              )
            }
          >
            <Download />
            Exporter le dossier
          </Button>
        </div>
      </div>
      <Stepper current={stage} request={request} go={go} />
      <div className="stage-content">
        {stage === 'intake' ? (
          <IntakePanel request={request} open={open} />
        ) : stage === 'analysis' ? (
          <AnalysisPanel
            request={request}
            state={analysis}
            setState={setAnalysis}
            notify={notify}
          />
        ) : stage === 'validation' ? (
          <ReviewPanel fields={fields} open={open} go={go} notify={notify} />
        ) : stage === 'pricing' ? (
          <PricingPanel notify={notify} />
        ) : stage === 'offer' ? (
          <LinkedStage
            title="Offre active"
            text="OFR-2026-142 v2 · envoyée le 15 août 2026 à 12:04"
            action="Ouvrir l’offre"
            onClick={() => go('/offers/OFR-2026-142')}
          />
        ) : stage === 'contract' ? (
          <LinkedStage
            title={
              request.ref === 'REQ-0278'
                ? 'Contrat signé'
                : 'Contrat non disponible'
            }
            text={
              request.ref === 'REQ-0278'
                ? 'CTR-2026-096 v1 · créé depuis OFR-2026-139 v3 sans ressaisie'
                : 'Une preuve d’acceptation de l’offre exacte est requise avant la génération.'
            }
            action={
              request.ref === 'REQ-0278'
                ? 'Ouvrir le contrat'
                : 'Revenir à l’offre'
            }
            onClick={() =>
              go(
                request.ref === 'REQ-0278'
                  ? '/contracts/CTR-2026-096'
                  : '/offers/OFR-2026-142',
              )
            }
          />
        ) : (
          <LinkedStage
            title="Dossier archivé et projet créé"
            text="Les versions approuvées, preuves et événements restent consultables. Le RAG n’utilise que les documents éligibles."
            action="Voir le projet"
            onClick={() => go('/projects/PRJ-0048')}
          />
        )}
      </div>
    </div>
  );
}

function LinkedStage({
  title,
  text,
  action,
  onClick,
}: {
  title: string;
  text: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <Surface className="linked-stage">
      <CheckCircle2 />
      <h2>{title}</h2>
      <p>{text}</p>
      <Button kind="primary" onClick={onClick}>
        {action}
        <ArrowRight />
      </Button>
    </Surface>
  );
}

function ClientsPage({
  selected,
  go,
  open,
  notify,
}: {
  selected?: string;
  go: (p: string) => void;
  open: (k: ModalKind, d?: string) => void;
  notify: (s: string) => void;
}) {
  const clients = [
    {
      id: 'CLI-001',
      name: 'AgroNova SRL',
      sector: 'Industrie alimentaire',
      contacts: 2,
      status: 'Confirmé',
    },
    {
      id: 'CLI-002',
      name: 'Fruct Moldova',
      sector: 'Agroalimentaire',
      contacts: 3,
      status: 'À compléter',
    },
    {
      id: 'CLI-003',
      name: 'Purcari Wineries',
      sector: 'Viticulture',
      contacts: 2,
      status: 'Confirmé',
    },
  ];
  const current = clients.find((c) => c.id === selected) || clients[0];
  return (
    <div className="page">
      <Heading
        eyebrow="RÉFÉRENTIEL CLIENT"
        title="Clients et contacts"
        subtitle="Données juridiques, état de confirmation, contacts multiples et historique métier."
        action={
          <Button kind="primary" onClick={() => open('client', 'new')}>
            <Plus />
            Nouveau client
          </Button>
        }
      />
      <div className="client-layout">
        <Surface className="client-list">
          <header>
            <label>
              <Search />
              <input placeholder="Rechercher un client" />
            </label>
          </header>
          {clients.map((c) => (
            <button
              key={c.id}
              className={c.id === current.id ? 'active' : ''}
              onClick={() => go(`/clients/${c.id}`)}
            >
              <span>{initials(c.name)}</span>
              <div>
                <b>{c.name}</b>
                <small>
                  {c.id} · {c.sector}
                </small>
              </div>
              <Status tone={c.status === 'Confirmé' ? 'success' : 'warning'}>
                {c.status}
              </Status>
            </button>
          ))}
        </Surface>
        <Surface className="client-detail">
          <header>
            <div className="entity-title">
              <span>{initials(current.name)}</span>
              <div>
                <small>{current.id}</small>
                <h2>{current.name}</h2>
              </div>
            </div>
            <Button onClick={() => open('client', current.id)}>
              <Edit3 />
              Modifier
            </Button>
          </header>
          <div className="data-provenance">
            <Status tone="success">Donnée confirmée</Status>
            <Status tone="info">Extraite non confirmée</Status>
            <Status tone="warning">Corrigée</Status>
            <Status>Obsolète</Status>
          </div>
          <dl className="facts grid">
            <div>
              <dt>Raison sociale</dt>
              <dd>{current.name}</dd>
              <small>Confirmée · registre v1</small>
            </div>
            <div>
              <dt>Forme juridique</dt>
              <dd>SRL</dd>
              <small>Confirmée</small>
            </div>
            <div>
              <dt>Code fiscal</dt>
              <dd>1018600048217</dd>
              <small>Confirmé</small>
            </div>
            <div>
              <dt>Statut TVA</dt>
              <dd>Assujetti</dd>
              <small>Corrigé le 12/08</small>
            </div>
            <div>
              <dt>Adresse et pays</dt>
              <dd>Str. Industrială 18 · Moldova</dd>
              <small>Confirmée</small>
            </div>
            <div>
              <dt>Site web</dt>
              <dd>agronova.md</dd>
              <small>Extrait · à confirmer</small>
            </div>
            <div>
              <dt>Secteur</dt>
              <dd>{current.sector}</dd>
              <small>Confirmé</small>
            </div>
            <div>
              <dt>Effectif et sites</dt>
              <dd>86 · 2 sites</dd>
              <small>Corrigé · preuve MSG-8818</small>
            </div>
          </dl>
          <h3 className="section-title">Contacts</h3>
          <div className="contacts">
            <article>
              <span>IR</span>
              <div>
                <b>Ion Rusu</b>
                <small>Directeur qualité · décisionnaire</small>
                <p>director.calitate@agronova.md · +373 22 555 014</p>
              </div>
              <Button
                kind="ghost"
                onClick={() =>
                  notify(
                    'Formulaire de modification du contact Ion Rusu ouvert.',
                  )
                }
              >
                Modifier
              </Button>
            </article>
            <article>
              <span>AM</span>
              <div>
                <b>Ana Munteanu</b>
                <small>Responsable administrative</small>
                <p>ana@agronova.md · +373 22 555 018</p>
              </div>
              <Button
                kind="ghost"
                onClick={() =>
                  notify(
                    'Formulaire de modification du contact Ana Munteanu ouvert.',
                  )
                }
              >
                Modifier
              </Button>
            </article>
            <Button
              onClick={() =>
                notify(
                  'Nouveau contact ajouté au brouillon de la fiche client.',
                )
              }
            >
              <Plus />
              Ajouter un contact
            </Button>
          </div>
          <h3 className="section-title">Historique lié</h3>
          <div className="linked-tabs">
            {[
              ['Demandes', 'REQ-0281 · Offre envoyée'],
              ['Offres', 'OFR-2026-142 v2 · Envoyée'],
              ['Contrats', 'Aucun contrat'],
              ['Documents', '6 documents · 4 indexés'],
            ].map(([a, b]) => (
              <button
                key={a}
                onClick={() =>
                  go(
                    a === 'Demandes'
                      ? '/request/REQ-0281/intake'
                      : a === 'Offres'
                        ? '/offers/OFR-2026-142'
                        : '/documents',
                  )
                }
              >
                <b>{a}</b>
                <span>{b}</span>
                <ChevronRight />
              </button>
            ))}
          </div>
        </Surface>
      </div>
    </div>
  );
}

function OffersPage({
  selected,
  go,
  open,
  notify,
  states,
  setStates,
}: {
  selected?: string;
  go: (p: string) => void;
  open: (k: ModalKind, d?: string) => void;
  notify: (s: string) => void;
  states: Record<string, string>;
  setStates: (
    update: (s: Record<string, string>) => Record<string, string>,
  ) => void;
}) {
  const current = offersSeed.find((o) => o.id === selected) || offersSeed[0];
  const status = states[current.id];
  const qa = [
    'Client et contact présents',
    'Snapshot déterministe lié',
    'Devise et TVA cohérentes',
    'Modèle documentaire approuvé',
    'Version du modèle enregistrée',
    'Durée de validité renseignée',
    'Numérotation unique',
    'Périmètre non vide',
    'Prestations détaillées',
    'Total propagé sans écart',
    'Langue du document conforme',
    'Pièces jointes autorisées',
  ];
  const transition = (next: string, msg: string) => {
    if (!window.confirm(msg)) return;
    setStates((s) => ({ ...s, [current.id]: next }));
    notify(`${current.id} : transition enregistrée et ajoutée au journal.`);
  };
  return (
    <div className="page">
      <Heading
        eyebrow="CYCLE COMMERCIAL"
        title="Offres"
        subtitle="Construction, QA, approbation, envoi manuel, décision client et versions immuables."
      />
      <div className="master-detail">
        <Surface className="master-list">
          <header>
            <div>
              <small>{offersSeed.length} OFFRES</small>
              <h2>Registre</h2>
            </div>
          </header>
          {offersSeed.map((o) => (
            <button
              className={o.id === current.id ? 'active' : ''}
              key={o.id}
              onClick={() => go(`/offers/${o.id}`)}
            >
              <FileCheck2 />
              <span>
                <b>
                  {o.id} {o.version}
                </b>
                <small>
                  {o.client} · {o.total}
                </small>
              </span>
              <Status tone={o.tone}>{workflowLabel(states[o.id])}</Status>
            </button>
          ))}
        </Surface>
        <div className="detail-stack">
          <Surface className="offer-builder">
            <header>
              <div>
                <small>
                  OFFRE {current.id} {current.version}
                </small>
                <h2>{current.client}</h2>
              </div>
              <Status
                tone={
                  status === 'qa_failed'
                    ? 'danger'
                    : status === 'accepted'
                      ? 'success'
                      : 'info'
                }
              >
                {workflowLabel(status)}
              </Status>
            </header>
            <div className="offer-form">
              <label>
                <span>Modèle documentaire</span>
                <select
                  defaultValue="OFFRE-RO-v5"
                  disabled={!['draft', 'qa_failed'].includes(status)}
                >
                  <option>OFFRE-RO-v5</option>
                  <option>OFFRE-RU-v3</option>
                </select>
              </label>
              <label>
                <span>Validité</span>
                <input
                  defaultValue="30 jours · jusqu’au 14/09/2026"
                  readOnly={!['draft', 'qa_failed'].includes(status)}
                />
              </label>
              <label>
                <span>Destinataire</span>
                <input
                  defaultValue="Ion Rusu · director.calitate@agronova.md"
                  readOnly={!['draft', 'qa_failed'].includes(status)}
                />
              </label>
              <label>
                <span>Snapshot source</span>
                <input value={current.source} readOnly />
              </label>
            </div>
            <button
              className="document-preview"
              onClick={() => open('document', current.id)}
            >
              <FileText />
              <span>
                <b>Prévisualisation complète</b>
                <small>7 pages · roumain · total {current.total}</small>
              </span>
              <Eye />
            </button>
            <div className="qa-section">
              <h3>12 contrôles automatiques</h3>
              {qa.map((x, i) => (
                <p
                  key={x}
                  className={
                    status === 'qa_failed' && i === 5
                      ? 'error'
                      : i === 8
                        ? 'warning'
                        : 'pass'
                  }
                >
                  {status === 'qa_failed' && i === 5 ? (
                    <XCircle />
                  ) : i === 8 ? (
                    <AlertTriangle />
                  ) : (
                    <CheckCircle2 />
                  )}
                  <span>{x}</span>
                  <Status
                    tone={
                      status === 'qa_failed' && i === 5
                        ? 'danger'
                        : i === 8
                          ? 'warning'
                          : 'success'
                    }
                  >
                    {status === 'qa_failed' && i === 5
                      ? 'Erreur'
                      : i === 8
                        ? 'Avertissement'
                        : 'Conforme'}
                  </Status>
                  {i === 8 && (
                    <Button
                      kind="ghost"
                      onClick={() =>
                        notify(
                          'Justification enregistrée : périmètre confirmé par le consultant.',
                        )
                      }
                    >
                      Justifier
                    </Button>
                  )}
                </p>
              ))}
            </div>
            <div className="workflow-actions">
              {status === 'qa_failed' && (
                <Button
                  kind="primary"
                  onClick={() =>
                    transition(
                      'draft',
                      'Créer une nouvelle version corrigée ? La version échouée restera consultable.',
                    )
                  }
                >
                  <Edit3 />
                  Corriger dans une nouvelle version
                </Button>
              )}
              {status === 'draft' && (
                <Button
                  kind="primary"
                  onClick={() =>
                    transition(
                      'pending_approval',
                      'Exécuter les 12 contrôles et soumettre à approbation ?',
                    )
                  }
                >
                  <ShieldCheck />
                  Lancer le QA
                </Button>
              )}
              {status === 'pending_approval' && (
                <>
                  <Button
                    kind="danger"
                    onClick={() =>
                      transition(
                        'rejected',
                        'Rejeter cette version avec commentaire ?',
                      )
                    }
                  >
                    Rejeter
                  </Button>
                  <Button
                    kind="primary"
                    onClick={() =>
                      transition(
                        'approved',
                        'Approuver et verrouiller exactement cette version ?',
                      )
                    }
                  >
                    <LockKeyhole />
                    Approuver et verrouiller
                  </Button>
                </>
              )}
              {status === 'approved' && (
                <Button
                  kind="primary"
                  onClick={() =>
                    transition(
                      'sent',
                      'Enregistrer manuellement l’envoi de cette version ?',
                    )
                  }
                >
                  <Send />
                  Enregistrer comme envoyée
                </Button>
              )}
              {status === 'sent' && (
                <Button
                  kind="primary"
                  onClick={() => open('acceptance', current.id)}
                >
                  <Check />
                  Enregistrer la décision client
                </Button>
              )}
              {status === 'accepted' && (
                <Button
                  kind="primary"
                  onClick={() => go('/contracts/CTR-2026-096')}
                >
                  <FilePlus2 />
                  Créer le contrat sans ressaisie
                </Button>
              )}
              {['rejected', 'expired', 'superseded'].includes(status) && (
                <Button
                  kind="primary"
                  onClick={() =>
                    transition(
                      'draft',
                      'Créer une nouvelle version depuis cette version ?',
                    )
                  }
                >
                  <RotateCcw />
                  Créer une nouvelle version
                </Button>
              )}
            </div>
          </Surface>
          <Surface className="version-panel">
            <header>
              <div>
                <small>VERSIONS & EXPORTS</small>
                <h2>Traçabilité documentaire</h2>
              </div>
            </header>
            <button
              onClick={() =>
                notify('Comparaison ouverte : v1 → v2, 4 changements métier.')
              }
            >
              <span>v2</span>
              <div>
                <b>Version active</b>
                <small>Approuvée puis envoyée · immuable</small>
              </div>
              <Eye />
            </button>
            <button
              onClick={() => notify('Version v1 ouverte en lecture seule.')}
            >
              <span>v1</span>
              <div>
                <b>Version remplacée</b>
                <small>Montant et durée modifiés</small>
              </div>
              <Eye />
            </button>
            <div className="compare">
              <p>
                <b>Montant TTC</b>
                <span>v1 8 712,00 €</span>
                <strong>v2 8 424,60 €</strong>
              </p>
              <p>
                <b>Validité</b>
                <span>15 jours</span>
                <strong>30 jours</strong>
              </p>
            </div>
            <Button
              onClick={() =>
                notify('Export DOCX préparé pour OFR-2026-142 v2.')
              }
            >
              <Download />
              Exporter DOCX
            </Button>
            <Button
              onClick={() => notify('Export PDF préparé pour OFR-2026-142 v2.')}
            >
              <Download />
              Exporter PDF
            </Button>
            <Button
              onClick={() =>
                transition(
                  'superseded',
                  'Créer v3 remplacera v2 sans supprimer son historique. Continuer ?',
                )
              }
            >
              <RotateCcw />
              Créer v3
            </Button>
          </Surface>
        </div>
      </div>
    </div>
  );
}

function ContractsPage({
  selected,
  go,
  open,
  notify,
  states,
  setStates,
}: {
  selected?: string;
  go: (p: string) => void;
  open: (k: ModalKind, d?: string) => void;
  notify: (s: string) => void;
  states: Record<string, string>;
  setStates: (
    update: (s: Record<string, string>) => Record<string, string>,
  ) => void;
}) {
  const current =
    contractsSeed.find((c) => c.id === selected) || contractsSeed[0];
  const status = states[current.id];
  const transition = (next: string) => {
    if (
      window.confirm(
        `Passer ${current.id} à l’état « ${workflowLabel(next)} » ? Cette action sera journalisée.`,
      )
    ) {
      setStates((x) => ({ ...x, [current.id]: next }));
      notify(`${current.id} : état ${workflowLabel(next)} enregistré.`);
    }
  };
  return (
    <div className="page">
      <Heading
        eyebrow="EXÉCUTION CONTRACTUELLE"
        title="Contrats"
        subtitle="Contrats générés depuis l’offre acceptée, contrôlés, approuvés, envoyés et signés avec preuve."
      />
      <div className="master-detail">
        <Surface className="master-list">
          <header>
            <div>
              <small>4 CONTRATS</small>
              <h2>Registre</h2>
            </div>
          </header>
          {contractsSeed.map((c) => (
            <button
              className={c.id === current.id ? 'active' : ''}
              key={c.id}
              onClick={() => go(`/contracts/${c.id}`)}
            >
              <ClipboardCheck />
              <span>
                <b>
                  {c.id} {c.version}
                </b>
                <small>
                  {c.client} · {c.total}
                </small>
              </span>
              <Status tone={c.tone}>{workflowLabel(states[c.id])}</Status>
            </button>
          ))}
        </Surface>
        <div className="detail-stack">
          <Surface>
            <header>
              <div>
                <small>
                  {current.id} {current.version}
                </small>
                <h2>{current.client}</h2>
              </div>
              <Status
                tone={
                  status === 'qa_failed'
                    ? 'danger'
                    : status === 'signed'
                      ? 'success'
                      : 'info'
                }
              >
                {workflowLabel(status)}
              </Status>
            </header>
            <div className="lineage">
              <Link2 />
              <span>
                <small>CRÉÉ SANS RESSAISIE DEPUIS</small>
                <b>{current.offer}</b>
              </span>
              <Button kind="ghost" onClick={() => go('/offers/OFR-2026-139')}>
                Ouvrir l’offre
              </Button>
            </div>
            <div className="contract-grid">
              <div>
                <h3>Comparaison avec l’offre acceptée</h3>
                {[
                  ['Client', 'Identique'],
                  ['Contact', 'Identique'],
                  ['Périmètre', 'Identique'],
                  ['Prestations', 'Identiques'],
                  ['Montant TTC', current.total],
                ].map((x) => (
                  <p key={x[0]}>
                    <CheckCircle2 />
                    <b>{x[0]}</b>
                    <span>{x[1]}</span>
                  </p>
                ))}
              </div>
              <div>
                <h3>Contrôles propres au contrat</h3>
                <p className={status === 'qa_failed' ? 'error' : ''}>
                  {status === 'qa_failed' ? <XCircle /> : <CheckCircle2 />}
                  <b>Clause de résiliation</b>
                  <span>
                    {status === 'qa_failed' ? 'Manquante' : 'Présente'}
                  </span>
                </p>
                <p>
                  <CheckCircle2 />
                  <b>Droit applicable</b>
                  <span>Conforme</span>
                </p>
                <p>
                  <CheckCircle2 />
                  <b>Signataires</b>
                  <span>Renseignés</span>
                </p>
              </div>
            </div>
            <div className="workflow-actions">
              {status === 'qa_failed' && (
                <Button kind="primary" onClick={() => transition('draft')}>
                  <Edit3 />
                  Corriger dans v3
                </Button>
              )}
              {status === 'draft' && (
                <Button
                  kind="primary"
                  onClick={() => transition('pending_approval')}
                >
                  <ShieldCheck />
                  Soumettre à approbation
                </Button>
              )}
              {status === 'pending_approval' && (
                <>
                  <Button kind="danger" onClick={() => transition('rejected')}>
                    Rejeter avec commentaire
                  </Button>
                  <Button kind="primary" onClick={() => transition('approved')}>
                    <LockKeyhole />
                    Approuver et verrouiller
                  </Button>
                </>
              )}
              {status === 'approved' && (
                <Button kind="primary" onClick={() => transition('sent')}>
                  <Send />
                  Enregistrer l’envoi
                </Button>
              )}
              {status === 'sent' && (
                <Button
                  kind="primary"
                  onClick={() => open('signature', current.id)}
                >
                  Enregistrer la signature
                </Button>
              )}
              {status === 'signed' && (
                <Button kind="primary" onClick={() => go('/projects/PRJ-0048')}>
                  <FolderKanban />
                  Ouvrir le projet minimal
                </Button>
              )}
              {['rejected', 'superseded'].includes(status) && (
                <Button onClick={() => transition('draft')}>
                  <RotateCcw />
                  Créer une nouvelle version
                </Button>
              )}
            </div>
          </Surface>
          <Surface className="version-panel">
            <header>
              <div>
                <small>APERÇU & VERSIONS</small>
                <h2>Document verrouillé</h2>
              </div>
            </header>
            <button onClick={() => open('document', current.id)}>
              <span>v2</span>
              <div>
                <b>Version consultée</b>
                <small>Empreinte sha256 · auteur et approbateur</small>
              </div>
              <Eye />
            </button>
            <button
              onClick={() =>
                notify(
                  'Comparaison du contrat v1 avec v2 ouverte : 3 modifications.',
                )
              }
            >
              <span>v1</span>
              <div>
                <b>Version remplacée</b>
                <small>Comparer 3 modifications</small>
              </div>
              <Eye />
            </button>
            <Button onClick={() => notify('Export DOCX du contrat préparé.')}>
              <Download />
              Exporter DOCX
            </Button>
            <Button onClick={() => notify('Export PDF du contrat préparé.')}>
              <Download />
              Exporter PDF
            </Button>
          </Surface>
        </div>
      </div>
    </div>
  );
}

function ProjectsPage({
  go,
  selected,
}: {
  go: (p: string) => void;
  selected?: string;
}) {
  const projects = [
    ['PRJ-0048', 'Purcari Wineries', 'CTR-2026-096 v1', 'Dan Popescu', 'Actif'],
    ['PRJ-0047', 'Moldova Fruct', 'CTR-2026-091 v2', 'Irina Ceban', 'Ouvert'],
  ];
  const current = projects.find((p) => p[0] === selected);
  return (
    <div className="page">
      <Heading
        eyebrow="REGISTRE MINIMAL"
        title="Projets"
        subtitle="Un projet ne peut être créé que depuis un contrat signé. Aucun module de mission détaillé n’est inclus dans le MVP."
      />
      <div className="scope-note">
        <ShieldCheck />
        <p>
          <b>Périmètre MVP :</b> registre en lecture, client, contrat source,
          responsable et statut. La création libre et les jalons sont exclus.
        </p>
      </div>
      <Surface className="data-table">
        <table>
          <thead>
            <tr>
              <th>Projet</th>
              <th>Client</th>
              <th>Contrat source</th>
              <th>Responsable</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p[0]}>
                <td>
                  <b>{p[0]}</b>
                  <small>Créé le 15/08/2026</small>
                </td>
                <td>{p[1]}</td>
                <td>
                  <button
                    className="source-link"
                    onClick={() => go('/contracts/CTR-2026-096')}
                  >
                    {p[2]}
                  </button>
                </td>
                <td>{p[3]}</td>
                <td>
                  <Status tone="success">{p[4]}</Status>
                </td>
                <td>
                  <button
                    className="row-open"
                    onClick={() => go(`/projects/${p[0]}`)}
                    aria-label={`Ouvrir ${p[0]}`}
                  >
                    <ChevronRight />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Surface>
      {current && (
        <Surface className="project-detail">
          <header>
            <div>
              <small>FICHE MINIMALE</small>
              <h2>
                {current[0]} · {current[1]}
              </h2>
            </div>
            <Status tone="success">{current[4]}</Status>
          </header>
          <dl className="facts">
            <div>
              <dt>Client source</dt>
              <dd>{current[1]}</dd>
            </div>
            <div>
              <dt>Contrat signé source</dt>
              <dd>{current[2]}</dd>
            </div>
            <div>
              <dt>Responsable</dt>
              <dd>{current[3]}</dd>
            </div>
            <div>
              <dt>Créé</dt>
              <dd>15/08/2026 · 14:48</dd>
            </div>
          </dl>
        </Surface>
      )}
    </div>
  );
}

function DocumentsPage({
  open,
  notify,
  initialScenario,
}: {
  open: (k: ModalKind, d?: string) => void;
  notify: (s: string) => void;
  initialScenario?: string | null;
}) {
  const [query, setQuery] = useState(
    initialScenario === 'tariff'
      ? 'Quel est le prix exact du diagnostic ?'
      : 'Quelles preuves confirment le périmètre HACCP ?',
  );
  const [scenario, setScenario] = useState(initialScenario || 'answer');
  const [searched, setSearched] = useState(!!initialScenario);
  const [indexState, setIndexState] = useState('failed');
  const run = () => {
    const q = query.toLowerCase();
    setScenario(
      /prix|tarif|tva|montant/.test(q)
        ? 'tariff'
        : /contrad/.test(q)
          ? 'conflict'
          : /aucune|inconnu/.test(q)
            ? 'insufficient'
            : 'answer',
    );
    setSearched(true);
  };
  const docs = [
    [
      'DOC-0441',
      'Cahier des besoins',
      'v2',
      'Approuvé',
      'Éligible',
      'Terminée',
    ],
    [
      'DOC-0442',
      'Offre OFR-2026-142',
      'v2',
      'Approuvé',
      'Éligible',
      'Terminée',
    ],
    ['DOC-0443', 'Tarif HACCP', 'v4', 'Approuvé', 'Exclu du RAG', '—'],
    [
      'DOC-0444',
      'Annexe illisible',
      'v1',
      'Brouillon',
      'Non éligible',
      indexState,
    ],
    [
      'DOC-0445',
      'Procédure qualité',
      'v3',
      'À approuver',
      'Non éligible',
      'pending',
    ],
    ['DOC-0420', 'Ancienne procédure', 'v1', 'Remplacé', 'Retiré', '—'],
    ['DOC-0401', 'Offre refusée', 'v1', 'Rejeté', 'Non éligible', '—'],
    ['DOC-0388', 'Guide historique', 'v2', 'Archivé', 'Retiré', '—'],
  ];
  return (
    <div className="page">
      <Heading
        eyebrow="CONNAISSANCE CONTRÔLÉE"
        title="Documents et recherche RAG"
        subtitle="Seules les versions approuvées, non remplacées et éligibles peuvent soutenir une réponse."
        action={
          <Button kind="primary" onClick={() => open('document', 'import')}>
            <UploadCloud />
            Importer
          </Button>
        }
      />
      <Surface className="rag-search">
        <div className="rag-scope">
          <ShieldCheck />
          <span>
            <small>PÉRIMÈTRE</small>
            <b>AgroNova SRL · documents approuvés</b>
          </span>
          <select aria-label="Périmètre RAG">
            <option>AgroNova SRL</option>
            <option>Corpus général PRISMA</option>
          </select>
        </div>
        <label>
          <Search />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
          />
          <Button kind="primary" onClick={run}>
            Rechercher
          </Button>
        </label>
        <div className="scenario-strip">
          <b>Tester un garde-fou</b>
          {[
            ['answer', 'Réponse sourcée'],
            ['insufficient', 'Sources insuffisantes'],
            ['conflict', 'Contradiction'],
            ['tariff', 'Question tarifaire'],
            ['error', 'Erreur technique'],
          ].map(([id, l]) => (
            <button
              className={scenario === id ? 'active' : ''}
              key={id}
              onClick={() => {
                setScenario(id);
                setSearched(true);
                setQuery(
                  id === 'tariff'
                    ? 'Quel est le prix exact du diagnostic ?'
                    : id === 'conflict'
                      ? 'Les sources sont-elles contradictoires ?'
                      : 'Quelles preuves confirment le périmètre HACCP ?',
                );
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </Surface>
      {searched && (
        <div className="rag-result">
          <Surface className={`rag-answer ${scenario}`}>
            <header>
              <div>
                <small>RÉPONSE CONTRÔLÉE</small>
                <h2>
                  {scenario === 'answer'
                    ? 'Réponse étayée'
                    : scenario === 'tariff'
                      ? 'Refus : source non autorisée'
                      : scenario === 'conflict'
                        ? 'Réponse suspendue'
                        : scenario === 'error'
                          ? 'Recherche indisponible'
                          : 'Sources insuffisantes'}
                </h2>
              </div>
              <Status
                tone={
                  scenario === 'answer'
                    ? 'success'
                    : scenario === 'error'
                      ? 'danger'
                      : 'warning'
                }
              >
                {scenario === 'answer' ? '3 citations' : 'Aucune affirmation'}
              </Status>
            </header>
            <p>
              {scenario === 'answer'
                ? 'Le périmètre couvre la production et le conditionnement sur deux sites. Cette synthèse reprend uniquement les versions approuvées et non remplacées.'
                : scenario === 'tariff'
                  ? 'Le RAG n’est pas la source autorisée pour un prix, une TVA ou une règle juridique. Consultez le snapshot déterministe lié au dossier.'
                  : scenario === 'conflict'
                    ? 'Deux versions approuvées donnent des périmètres différents. Une décision humaine est requise avant toute réponse.'
                    : scenario === 'error'
                      ? 'La recherche a échoué sans modifier le corpus. Vous pouvez relancer ou consulter le diagnostic.'
                      : 'Aucune source approuvée et suffisamment pertinente ne permet de répondre sans extrapoler.'}
            </p>
            {scenario === 'answer' && (
              <div className="citations">
                {[
                  [
                    '1',
                    'Cahier des besoins v2',
                    'p.4 · score 0,94 · indexé 15/08',
                  ],
                  ['2', 'Email client v1', '§2 · score 0,91 · indexé 15/08'],
                  [
                    '3',
                    'Annexe périmètre v2',
                    'p.1 · score 0,86 · indexé 15/08',
                  ],
                ].map((x) => (
                  <button key={x[0]} onClick={() => open('document', x[1])}>
                    <span>{x[0]}</span>
                    <b>{x[1]}</b>
                    <small>{x[2]} · Approuvé</small>
                  </button>
                ))}
              </div>
            )}
            <footer>
              <Button
                onClick={() => notify('Réponse signalée pour revue humaine.')}
              >
                Signaler
              </Button>
              <Button onClick={() => open('document', 'sources')}>
                Ouvrir les sources
              </Button>
              {scenario === 'error' && (
                <Button kind="primary" onClick={run}>
                  <RefreshCw />
                  Réessayer
                </Button>
              )}
            </footer>
          </Surface>
          <Surface className="safety">
            <small>GARDE-FOUS ACTIFS</small>
            <h2>Pourquoi cette réponse est sûre</h2>
            {[
              'Versions approuvées uniquement',
              'Documents remplacés exclus',
              'Citation avec page et score',
              'Aucun calcul par le RAG',
              'Refus en cas d’insuffisance',
              'Journalisation de la requête',
            ].map((x) => (
              <p key={x}>
                <CheckCircle2 />
                {x}
              </p>
            ))}
          </Surface>
        </div>
      )}
      <Surface className="document-library">
        <header>
          <div>
            <small>BIBLIOTHÈQUE</small>
            <h2>Versions et indexation</h2>
          </div>
          <div>
            <Button
              onClick={() =>
                notify(
                  'Filtres documentaires ouverts : statut, version, corpus et indexation.',
                )
              }
            >
              <Filter />
              Filtres
            </Button>
            <Button
              onClick={() =>
                notify('Vue filtrée : documents éligibles au RAG.')
              }
            >
              Éligibles RAG
            </Button>
          </div>
        </header>
        <table>
          <thead>
            <tr>
              <th>Document</th>
              <th>Version</th>
              <th>Statut</th>
              <th>Corpus</th>
              <th>Indexation</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d[0]}>
                <td>
                  <button
                    className="entity-link"
                    onClick={() => open('document', d[0])}
                  >
                    <span>
                      <FileText />
                    </span>
                    <b>{d[1]}</b>
                    <small>{d[0]} · auteur Elena Rusu</small>
                  </button>
                </td>
                <td>{d[2]}</td>
                <td>
                  <Status tone={d[3] === 'Approuvé' ? 'success' : 'warning'}>
                    {d[3]}
                  </Status>
                </td>
                <td>{d[4]}</td>
                <td>
                  <Status
                    tone={
                      d[5] === 'failed'
                        ? 'danger'
                        : d[5] === 'running'
                          ? 'info'
                          : d[5] === 'Terminée'
                            ? 'success'
                            : 'neutral'
                    }
                  >
                    {d[5] === 'pending' ? 'En attente' : d[5]}
                  </Status>
                </td>
                <td>
                  <div className="inline-actions">
                    <button
                      onClick={() => open('document', d[0])}
                      aria-label={`Gérer ${d[0]}`}
                    >
                      <MoreHorizontal />
                    </button>
                    {d[5] === 'failed' && (
                      <button
                        onClick={() => {
                          setIndexState('running');
                          setTimeout(() => setIndexState('Terminée'), 800);
                          notify(
                            'Réindexation lancée. L’erreur précédente reste consultable.',
                          );
                        }}
                        aria-label="Réindexer"
                      >
                        <RefreshCw />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Surface>
    </div>
  );
}

function CatalogPage({
  open,
  notify,
}: {
  open: (k: ModalKind, d?: string) => void;
  notify: (s: string) => void;
}) {
  const [tab, setTab] = useState('active');
  const data = {
    active: [
      [
        'SRV-HACCP',
        'Diagnostic HACCP',
        'TAR-HACCP v4',
        'EUR',
        'TVA 20 %',
        '15/08–31/12',
        'Actif',
      ],
    ],
    draft: [
      [
        'SRV-ISO22K',
        'Préparation ISO 22000',
        'TAR-ISO22K v4',
        'EUR',
        'TVA 20 %',
        'À définir',
        'Brouillon',
      ],
    ],
    archived: [
      [
        'SRV-AUDIT',
        'Audit interne',
        'TAR-AUDIT v2',
        'EUR',
        'TVA 20 %',
        '01/01–14/08',
        'Archivé',
      ],
    ],
  } as const;
  return (
    <div className="page">
      <Heading
        eyebrow="MOTEUR DÉTERMINISTE"
        title="Services et tarifs"
        subtitle="Catalogue versionné : services, règles, taxes, frais, auteurs, validité et activation explicite."
        action={
          <Button kind="primary" onClick={() => open('catalog', 'new')}>
            <Plus />
            Nouveau service
          </Button>
        }
      />
      <div className="tabs">
        {[
          ['active', 'Actifs'],
          ['draft', 'Brouillons'],
          ['archived', 'Archivés'],
        ].map(([id, l]) => (
          <button
            className={tab === id ? 'active' : ''}
            key={id}
            onClick={() => setTab(id)}
          >
            {l}
          </button>
        ))}
      </div>
      <Surface className="data-table">
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th>Tarif</th>
              <th>Devise</th>
              <th>TVA</th>
              <th>Validité</th>
              <th>État</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data[tab as keyof typeof data].map((r) => (
              <tr key={r[0]}>
                <td>
                  <b>{r[1]}</b>
                  <small>{r[0]} · créé par Irina Ceban</small>
                </td>
                <td>
                  {r[2]}
                  <small>auditeur, consultant, expert et frais détaillés</small>
                </td>
                <td>{r[3]}</td>
                <td>{r[4]}</td>
                <td>{r[5]}</td>
                <td>
                  <Status
                    tone={
                      tab === 'active'
                        ? 'success'
                        : tab === 'draft'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {r[6]}
                  </Status>
                </td>
                <td>
                  <button
                    className="row-open"
                    onClick={() => open('catalog', r[0])}
                    aria-label={`Ouvrir ${r[0]}`}
                  >
                    <ChevronRight />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Surface>
      <Surface className="version-compare">
        <header>
          <div>
            <small>COMPARAISON DE VERSIONS</small>
            <h2>TAR-HACCP v3 → v4</h2>
          </div>
          <Button onClick={() => notify('Comparaison v3/v4 exportée.')}>
            <Download />
            Exporter
          </Button>
        </header>
        <div>
          {[
            ['Consultant / jour', '1 580 € → 1 650 €'],
            ['Auditeur / jour', '1 720 € → 1 790 €'],
            ['Hébergement', '170 € → 180 €'],
            ['Traduction / page', '65 € → 70 €'],
            ['Indemnité', '0 € → 0 €'],
            ['Commission', 'Non applicable'],
          ].map((x) => (
            <p key={x[0]}>
              <CheckCircle2 />
              <b>{x[0]}</b>
              <span>{x[1]}</span>
            </p>
          ))}
        </div>
      </Surface>
    </div>
  );
}

function ActivityPage({
  open,
  notify,
}: {
  open: (k: ModalKind, d?: string) => void;
  notify: (s: string) => void;
}) {
  const [type, setType] = useState('Tous');
  const [query, setQuery] = useState('');
  const rows = auditSeed.filter(
    (x) =>
      (type === 'Tous' || x[4] === type) &&
      `${x[1]} ${x[2]} ${x[3]}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="page">
      <Heading
        eyebrow="TRAÇABILITÉ INTÉGRALE"
        title="Journal d’audit"
        subtitle="Avant/après, auteur, date, règle, preuve, erreur, reprise et navigation vers l’entité."
        action={
          <Button
            onClick={() =>
              notify('Export CSV du journal préparé avec les filtres actifs.')
            }
          >
            <Download />
            Exporter CSV
          </Button>
        }
      />
      <div className="audit-layout">
        <Surface className="filters">
          <h2>Filtres</h2>
          <label>
            <span>Recherche</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Référence, auteur, action"
            />
          </label>
          <label>
            <span>Type d’entité</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {[
                'Tous',
                'Document',
                'Contrat',
                'Offre',
                'Calcul',
                'Revue',
                'IA',
                'Tarif',
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Auteur</span>
            <select>
              <option>Tous</option>
              <option>Dan Popescu</option>
              <option>Irina Ceban</option>
              <option>Système</option>
            </select>
          </label>
          <label>
            <span>Période</span>
            <select>
              <option>15 août 2026</option>
              <option>7 derniers jours</option>
              <option>Personnalisée</option>
            </select>
          </label>
          <Button
            onClick={() => {
              setType('Tous');
              setQuery('');
            }}
          >
            <RotateCcw />
            Réinitialiser
          </Button>
        </Surface>
        <Surface className="audit-list">
          <header>
            <div>
              <small>{rows.length} ÉVÉNEMENTS</small>
              <h2>Chronologie du 15 août 2026</h2>
            </div>
          </header>
          {rows.map((x, i) => (
            <button
              key={`${x[0]}${x[1]}`}
              onClick={() => open('event', String(i))}
            >
              <time>{x[0]}</time>
              <i className={i < 4 ? 'critical' : ''} />
              <span>
                <b>{x[1]}</b>
                <p>{x[2]}</p>
                <small>
                  {x[3]} · {x[4]}
                </small>
              </span>
              <ChevronRight />
            </button>
          ))}
        </Surface>
      </div>
    </div>
  );
}

function UsersPage({
  open,
  notify,
}: {
  open: (k: ModalKind, d?: string) => void;
  notify: (s: string) => void;
}) {
  const [tab, setTab] = useState('active');
  const [disabled, setDisabled] = useState(false);
  return (
    <div className="page">
      <Heading
        eyebrow="ACCÈS INTERNE"
        title="Utilisateurs"
        subtitle="Invitations nominatives, droits uniformes, expiration, désactivation et journal des accès."
        action={
          <Button kind="primary" onClick={() => open('invite')}>
            <UserRoundPlus />
            Inviter
          </Button>
        }
      />
      <div className="scope-note">
        <ShieldCheck />
        <p>
          <b>Périmètre MVP :</b> tous les utilisateurs internes invités
          disposent des mêmes droits applicatifs. Les rôles granulaires sont une
          extension future.
        </p>
      </div>
      <div className="tabs">
        {[
          ['active', 'Actifs'],
          ['pending', 'Invitations'],
          ['disabled', 'Désactivés'],
          ['denied', 'Accès refusé'],
        ].map(([id, l]) => (
          <button
            className={tab === id ? 'active' : ''}
            onClick={() => setTab(id)}
            key={id}
          >
            {l}
          </button>
        ))}
      </div>
      <Surface className="users-list">
        {tab === 'active' &&
          [
            ['DP', 'Dan Popescu', 'dan@prisma.md', 'Aujourd’hui 11:02'],
            ['IC', 'Irina Ceban', 'irina@prisma.md', 'Aujourd’hui 09:44'],
            ['ER', 'Elena Rusu', 'elena@prisma.md', 'Hier 17:21'],
          ].map((u, i) => (
            <article key={u[2]}>
              <span>{u[0]}</span>
              <div>
                <b>{u[1]}</b>
                <small>{u[2]}</small>
              </div>
              <p>Dernière connexion · {u[3]}</p>
              <Status tone={i === 2 && disabled ? 'neutral' : 'success'}>
                {i === 2 && disabled ? 'Désactivé' : 'Actif'}
              </Status>
              <Button
                kind="ghost"
                onClick={() => {
                  if (window.confirm(`Désactiver ${u[1]} ?`)) {
                    setDisabled(true);
                    notify('Accès désactivé et journalisé.');
                  }
                }}
              >
                Désactiver
              </Button>
            </article>
          ))}
        {tab === 'pending' &&
          [
            ['VM', 'Victor Munteanu', 'Expire dans 3 jours', 'warning'],
            ['AC', 'Ana Cebotari', 'Invitation expirée', 'danger'],
          ].map((u) => (
            <article key={u[1]}>
              <span>{u[0]}</span>
              <div>
                <b>{u[1]}</b>
                <small>{u[1].toLowerCase().replace(' ', '.')}@prisma.md</small>
              </div>
              <p>{u[2]}</p>
              <Status tone={u[3] as Tone}>{u[2]}</Status>
              <Button
                kind="ghost"
                onClick={() =>
                  notify(
                    `Invitation renvoyée à ${u[1]} ; nouvelle expiration dans 7 jours.`,
                  )
                }
              >
                <RefreshCw />
                Renvoyer
              </Button>
            </article>
          ))}
        {tab === 'disabled' && (
          <article>
            <span>MP</span>
            <div>
              <b>Mihai Popa</b>
              <small>mihai@prisma.md</small>
            </div>
            <p>Désactivé le 01/08 par Dan Popescu</p>
            <Status>Désactivé</Status>
            <Button
              kind="ghost"
              onClick={() => notify('Utilisateur réactivé après confirmation.')}
            >
              Réactiver
            </Button>
          </article>
        )}
        {tab === 'denied' && (
          <Empty
            title="Accès refusé"
            text="Ce compte ne possède aucune invitation active pour l’espace PRISMA Consultant."
            action={
              <Button
                onClick={() => notify('Demande de nouvel envoi enregistrée.')}
              >
                Demander une invitation
              </Button>
            }
          />
        )}
      </Surface>
      <Surface className="access-log">
        <header>
          <div>
            <small>JOURNAL DES ACCÈS</small>
            <h2>Derniers événements</h2>
          </div>
        </header>
        {[
          'Connexion réussie · Dan Popescu · 11:02',
          'Invitation renvoyée · Ana Cebotari · 10:11',
          'Accès refusé · compte inconnu · 09:58',
          'Utilisateur désactivé · Mihai Popa · 01/08',
        ].map((x) => (
          <p key={x}>
            <History />
            {x}
          </p>
        ))}
      </Surface>
    </div>
  );
}

function CoveragePage({ go }: { go: (p: string) => void }) {
  const [only, setOnly] = useState(false);
  return (
    <div className="page">
      <Heading
        eyebrow="SPÉCIFICATION INTERACTIVE"
        title="Matrice de conformité MVP"
        subtitle="Chaque critère renvoie vers un écran, un scénario et une preuve directement vérifiables."
      />
      <div className="coverage-summary">
        <CheckCircle2 />
        <div>
          <b>P0, P1 et P2 couverts</b>
          <span>18 critères reliés à une preuve interactive</span>
        </div>
        <Status tone="success">Conforme</Status>
        <label>
          <input
            type="checkbox"
            checked={only}
            onChange={(e) => setOnly(e.target.checked)}
          />
          Afficher uniquement les écarts
        </label>
      </div>
      {only ? (
        <Surface>
          <Empty
            title="Aucun écart ouvert"
            text="Tous les critères P0, P1 et P2 disposent d’un écran, d’un état et d’une preuve vérifiable."
          />
        </Surface>
      ) : (
        <Surface className="coverage-table">
          <table>
            <thead>
              <tr>
                <th>Critère</th>
                <th>Exigence</th>
                <th>Preuve</th>
                <th>État</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {coverageRows.map((r) => (
                <tr key={r[0]}>
                  <td>
                    <b>{r[0]}</b>
                  </td>
                  <td>{r[1]}</td>
                  <td>{r[3]}</td>
                  <td>
                    <Status tone="success">Conforme</Status>
                  </td>
                  <td>
                    <button
                      className="row-open"
                      onClick={() => go(r[2].replace(/^#/, ''))}
                      aria-label={`Ouvrir la preuve ${r[0]}`}
                    >
                      <ArrowRight />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Surface>
      )}
      <Surface className="scenario-matrix">
        <header>
          <div>
            <small>16 SCÉNARIOS DE RECETTE</small>
            <h2>Accès direct aux parcours</h2>
          </div>
        </header>
        <div>
          {[
            ['Créer un client et importer un DOCX', '/clients/CLI-001'],
            ['Gérer un fichier invalide ou un doublon', '/requests'],
            ['Relancer une analyse échouée', '/request/REQ-0279/analysis'],
            [
              'Résoudre un champ critique manquant',
              '/request/REQ-0280/validation',
            ],
            [
              'Arbitrer deux sources contradictoires',
              '/request/REQ-0280/validation',
            ],
            [
              'Corriger une donnée et invalider le calcul',
              '/request/REQ-0281/pricing',
            ],
            ['Dépasser le seuil de remise', '/request/REQ-0281/pricing'],
            ['Corriger une offre rejetée par QA', '/offers/OFR-2026-145'],
            ['Justifier un avertissement', '/offers/OFR-2026-142'],
            ['Comparer deux versions d’offre', '/offers/OFR-2026-142'],
            [
              'Transformer une offre acceptée en contrat',
              '/offers/OFR-2026-139',
            ],
            ['Rejeter puis corriger un contrat', '/contracts/CTR-2026-099'],
            ['Approuver puis indexer un document', '/documents'],
            ['Reprendre une indexation échouée', '/documents'],
            [
              'Obtenir une réponse ou un refus RAG',
              '/documents?scenario=tariff',
            ],
            ['Renvoyer une invitation expirée', '/users'],
          ].map((x, i) => (
            <button key={x[0]} onClick={() => go(x[1])}>
              <span>{i + 1}</span>
              <CheckCircle2 />
              <b>{x[0]}</b>
              <ArrowRight />
            </button>
          ))}
        </div>
      </Surface>
    </div>
  );
}

function ModalShell({
  title,
  eyebrow,
  close,
  dirty = false,
  children,
  footer,
  wide = false,
}: {
  title: string;
  eyebrow: string;
  close: () => void;
  dirty?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const requestClose = () => {
    if (
      !dirty ||
      window.confirm(
        'Des modifications ne sont pas enregistrées. Fermer quand même ?',
      )
    )
      close();
  };
  useEffect(() => {
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
      if (e.key !== 'Tab' || !ref.current) return;
      const all = Array.from(
        ref.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!all.length) return;
      const first = all[0],
        last = all[all.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  });
  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && requestClose()}
    >
      <section
        ref={ref}
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <header>
          <div>
            <small>{eyebrow}</small>
            <h2 id="dialog-title">{title}</h2>
          </div>
          <button ref={closeRef} onClick={requestClose} aria-label="Fermer">
            <X />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>
  );
}

function FieldModal({
  field,
  save,
  close,
}: {
  field: ReviewField;
  save: (
    id: string,
    value: string,
    state: ReviewField['state'],
    reason: string,
  ) => void;
  close: () => void;
}) {
  const [value, setValue] = useState(field.retained);
  const [state, setState] = useState<ReviewField['state']>(
    field.state === 'missing' || field.state === 'conflict'
      ? 'corrected'
      : field.state,
  );
  const [reason, setReason] = useState(field.rationale);
  const [dirty, setDirty] = useState(false);
  const valid = value.trim() && reason.trim();
  return (
    <ModalShell
      title={field.label}
      eyebrow="DÉCISION HUMAINE TRAÇABLE"
      close={close}
      dirty={dirty}
      footer={
        <>
          <Button onClick={close}>Annuler</Button>
          <Button
            kind="primary"
            disabled={!valid}
            onClick={() => save(field.id, value, state, reason)}
          >
            <Save />
            Enregistrer la décision
          </Button>
        </>
      }
    >
      <div className="field-summary">
        <Status
          tone={
            field.state === 'missing'
              ? 'danger'
              : field.state === 'conflict'
                ? 'warning'
                : 'info'
          }
        >
          {field.critical ? 'Critique' : 'Non critique'} · {field.state}
        </Status>
        <p>Aucune valeur IA n’est retenue sans décision humaine explicite.</p>
      </div>
      <div className="evidence-compare">
        <article>
          <small>PROPOSITION IA</small>
          <b>{field.ai}</b>
          <p>
            {field.confidence == null
              ? 'Confiance indisponible'
              : `Confiance ${field.confidence} %`}
          </p>
        </article>
        <article>
          <small>SOURCE · {field.source}</small>
          <b>{field.fragment}</b>
          <p>{field.rationale}</p>
        </article>
      </div>
      <label className="field">
        <span>Décision *</span>
        <select
          value={state}
          onChange={(e) => {
            setState(e.target.value as ReviewField['state']);
            setDirty(true);
          }}
        >
          <option value="confirmed">Confirmer la proposition</option>
          <option value="corrected">Corriger la valeur</option>
          <option value="inferred">Accepter la déduction</option>
          <option value="missing">Marquer comme manquant</option>
        </select>
      </label>
      <label className="field">
        <span>Valeur humaine retenue *</span>
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setDirty(true);
          }}
        />
      </label>
      <label className="field">
        <span>Justification obligatoire *</span>
        <textarea
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setDirty(true);
          }}
        />
      </label>
      <div className="destructive-note">
        <RotateCcw />
        <span>
          Si ce champ a déjà été utilisé, la modification invalidera le calcul
          actif et exigera un nouveau snapshot.
        </span>
      </div>
    </ModalShell>
  );
}

function CreateRequestModal({
  close,
  go,
  notify,
}: {
  close: () => void;
  go: (p: string) => void;
  notify: (s: string) => void;
}) {
  const [step, setStep] = useState(1);
  const [channel, setChannel] = useState('Email');
  const [scenario, setScenario] = useState('valid');
  const [newClient, setNewClient] = useState(false);
  const [dirty, setDirty] = useState(false);
  const valid = scenario === 'valid';
  return (
    <ModalShell
      wide
      title="Importer une demande client"
      eyebrow="NOUVELLE DEMANDE · ÉTAPE PAR ÉTAPE"
      close={close}
      dirty={dirty}
      footer={
        <>
          <Button onClick={() => (step === 1 ? close() : setStep(step - 1))}>
            {step === 1 ? 'Annuler' : 'Retour'}
          </Button>
          <Button
            kind="primary"
            disabled={step === 1 && !valid}
            onClick={() => {
              if (step < 3) setStep(step + 1);
              else {
                notify(
                  'REQ-0285 créée. L’analyse attend une décision explicite.',
                );
                close();
                go('/request/REQ-0281/intake');
              }
            }}
          >
            {step < 3 ? 'Continuer' : 'Créer la demande'}
            <ArrowRight />
          </Button>
        </>
      }
    >
      <div className="wizard-steps">
        <span className={step >= 1 ? 'active' : ''}>1 · Source</span>
        <span className={step >= 2 ? 'active' : ''}>2 · Client</span>
        <span className={step >= 3 ? 'active' : ''}>3 · Vérification</span>
      </div>
      {step === 1 && (
        <>
          <div className="channel-grid">
            {[
              ['Email', Mail],
              ['Documents', UploadCloud],
              ['Formulaire', ClipboardCheck],
              ['Saisie', Edit3],
            ].map(([l, Icon]) => (
              <button
                className={channel === l ? 'active' : ''}
                key={String(l)}
                onClick={() => {
                  setChannel(String(l));
                  setDirty(true);
                }}
              >
                <Icon />
                <b>{l as string}</b>
              </button>
            ))}
          </div>
          <label className="field">
            <span>Email ou texte de la demande *</span>
            <textarea
              defaultValue="Bună ziua, dorim o evaluare inițială HACCP…"
              onChange={() => setDirty(true)}
            />
          </label>
          <label className="upload-zone">
            <UploadCloud />
            <b>Déposer les pièces</b>
            <span>PDF, DOCX, XLSX · 25 Mo maximum · contenu vérifié</span>
            <input type="file" multiple onChange={() => setDirty(true)} />
          </label>
          <div className="scenario-strip">
            <b>Tester l’import</b>
            {[
              ['valid', 'Valide'],
              ['invalid', 'Illisible'],
              ['duplicate', 'Doublon'],
              ['oversize', 'Trop volumineux'],
            ].map(([id, l]) => (
              <button
                className={scenario === id ? 'active' : ''}
                key={id}
                onClick={() => {
                  setScenario(id);
                  setDirty(true);
                }}
              >
                {l}
              </button>
            ))}
          </div>
          <div className={`upload-result ${scenario}`}>
            <FileText />
            <span>
              <b>Cahier_des_besoins.docx</b>
              <small>
                {scenario === 'valid'
                  ? '1,2 Mo · format et contenu valides'
                  : scenario === 'invalid'
                    ? 'Document corrompu · remplacez le fichier'
                    : scenario === 'duplicate'
                      ? 'Déjà présent dans REQ-0272 · ouvrir ou remplacer'
                      : '31 Mo · maximum autorisé 25 Mo'}
              </small>
            </span>
            {valid ? <CheckCircle2 /> : <XCircle />}
          </div>
          {scenario === 'duplicate' && (
            <Button
              onClick={() => {
                close();
                go('/request/REQ-0279/intake');
              }}
            >
              Ouvrir le dossier existant
            </Button>
          )}
        </>
      )}
      {step === 2 && (
        <>
          <label className="field">
            <span>Client *</span>
            <select
              onChange={(e) => {
                setNewClient(e.target.value === 'new');
                setDirty(true);
              }}
            >
              <option value="existing">AgroNova SRL · reconnu</option>
              <option value="new">Créer une nouvelle entité</option>
            </select>
          </label>
          {newClient && (
            <div className="form-grid">
              <label className="field">
                <span>Raison sociale *</span>
                <input />
              </label>
              <label className="field">
                <span>Forme juridique *</span>
                <input />
              </label>
              <label className="field">
                <span>Code fiscal *</span>
                <input />
              </label>
              <label className="field">
                <span>Pays *</span>
                <input defaultValue="République de Moldova" />
              </label>
            </div>
          )}
          <div className="form-grid">
            <label className="field">
              <span>Contact *</span>
              <input defaultValue="Ion Rusu" />
            </label>
            <label className="field">
              <span>Langue détectée</span>
              <select>
                <option>Roumain</option>
                <option>Russe</option>
                <option>Anglais</option>
              </select>
            </label>
            <label className="field">
              <span>Responsable interne</span>
              <select>
                <option>Dan Popescu</option>
              </select>
            </label>
            <label className="field">
              <span>Échéance</span>
              <input type="date" defaultValue="2026-08-18" />
            </label>
          </div>
        </>
      )}
      {step === 3 && (
        <>
          <div className="review-ready">
            <CheckCircle2 />
            <h3>Demande prête à être créée</h3>
            <p>
              {channel} · client reconnu · langue roumaine · 1 fichier
              exploitable · aucun doublon
            </p>
          </div>
          <dl className="facts">
            <div>
              <dt>Analyse IA</dt>
              <dd>Non lancée automatiquement</dd>
            </div>
            <div>
              <dt>Action suivante</dt>
              <dd>Lancer explicitement l’analyse</dd>
            </div>
          </dl>
          <label className="check">
            <input type="checkbox" />
            Lancer l’analyse IA après création
          </label>
        </>
      )}
    </ModalShell>
  );
}

function AppModal({
  modal,
  close,
  open,
  fields,
  saveField,
  go,
  notify,
  context,
  setOfferState,
  setContractState,
}: {
  modal: ModalState;
  close: () => void;
  open: (k: ModalKind, d?: string) => void;
  fields: ReviewField[];
  saveField: (
    id: string,
    value: string,
    state: ReviewField['state'],
    reason: string,
  ) => void;
  go: (p: string) => void;
  notify: (s: string) => void;
  context: string;
  setOfferState: (id: string, state: string) => void;
  setContractState: (id: string, state: string) => void;
}) {
  if (!modal) return null;
  if (modal.kind === 'field') {
    const f = fields.find((x) => x.id === modal.data) || fields[0];
    return <FieldModal field={f} save={saveField} close={close} />;
  }
  if (modal.kind === 'create')
    return <CreateRequestModal close={close} go={go} notify={notify} />;
  if (modal.kind === 'acceptance')
    return (
      <DecisionModal
        id={modal.data || 'OFR-2026-142'}
        close={close}
        notify={notify}
        complete={setOfferState}
      />
    );
  if (modal.kind === 'signature')
    return (
      <SignatureModal
        id={modal.data || 'CTR-2026-096'}
        close={close}
        notify={notify}
        complete={setContractState}
      />
    );
  if (modal.kind === 'client')
    return (
      <FormModal
        title={
          modal.data === 'new' ? 'Créer un client' : 'Modifier la fiche client'
        }
        eyebrow="DONNÉES JURIDIQUES ET CONTACTS"
        close={close}
        notify={notify}
      />
    );
  if (modal.kind === 'catalog')
    return (
      <CatalogModal id={modal.data || 'new'} close={close} notify={notify} />
    );
  if (modal.kind === 'invite')
    return <InviteModal close={close} notify={notify} />;
  if (modal.kind === 'assistant')
    return <AssistantModal context={context} close={close} open={open} />;
  if (modal.kind === 'search') return <SearchModal close={close} go={go} />;
  const content: Record<string, [string, string, ReactNode]> = {
    help: [
      'Centre d’aide',
      'AIDE CONTEXTUELLE',
      <div key="help" className="stack">
        <button onClick={() => go('/coverage')}>
          <ShieldCheck />
          <span>
            <b>Vérifier la couverture MVP</b>
            <small>Matrice P0, P1 et P2</small>
          </span>
        </button>
        <button
          onClick={() =>
            notify(
              'Aide ouverte : chaque blocage indique sa cause, son effet et sa résolution.',
            )
          }
        >
          <CircleHelp />
          <span>
            <b>Comprendre un blocage</b>
            <small>Cause, conséquence et résolution</small>
          </span>
        </button>
      </div>,
    ],
    notifications: [
      'Notifications',
      '3 ACTIONS À TRAITER',
      <div key="notifications" className="stack">
        {requests.slice(0, 3).map((r) => (
          <button
            key={r.ref}
            onClick={() => {
              close();
              go(`/request/${r.ref}/${r.stage}`);
            }}
          >
            <AlertTriangle />
            <span>
              <b>{r.next}</b>
              <small>
                {r.client} · {r.due}
              </small>
            </span>
          </button>
        ))}
      </div>,
    ],
    account: [
      'Compte utilisateur',
      'ACCÈS INTERNE ACTIF',
      <dl key="account" className="facts">
        <div>
          <dt>Utilisateur</dt>
          <dd>Dan Popescu</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>dan@prisma.md</dd>
        </div>
        <div>
          <dt>Droits</dt>
          <dd>Uniformes MVP</dd>
        </div>
        <div>
          <dt>Dernière connexion</dt>
          <dd>15/08/2026 · 11:02</dd>
        </div>
      </dl>,
    ],
    document: [
      `Document ${modal.data || ''}`,
      'VERSION, PREUVE ET INDEXATION',
      <DocumentActions
        key="document"
        id={modal.data || 'DOC-0441'}
        notify={notify}
      />,
    ],
    event: [
      'Détail de l’événement',
      'TRAÇABILITÉ CRITIQUE',
      <dl key="event" className="facts">
        <div>
          <dt>Entité</dt>
          <dd>{modal.data || 'REQ-0281'}</dd>
        </div>
        <div>
          <dt>Avant</dt>
          <dd>3 sites</dd>
        </div>
        <div>
          <dt>Après</dt>
          <dd>2 sites</dd>
        </div>
        <div>
          <dt>Auteur</dt>
          <dd>Dan Popescu</dd>
        </div>
        <div>
          <dt>Preuve</dt>
          <dd>MSG-8818</dd>
        </div>
        <div>
          <dt>Effet</dt>
          <dd>CAL-0281-02 invalidé</dd>
        </div>
      </dl>,
    ],
    case: [
      'Résultats des 20 cas',
      'ÉVALUATION DU PILOTE',
      <CaseTable key="case" />,
    ],
  };
  const [title, eyebrow, body] = content[modal.kind] || content.help;
  return (
    <ModalShell
      title={title}
      eyebrow={eyebrow}
      close={close}
      wide={modal.kind === 'case'}
    >
      {body}
    </ModalShell>
  );
}

function DecisionModal({
  id,
  close,
  notify,
  complete,
}: {
  id: string;
  close: () => void;
  notify: (s: string) => void;
  complete: (id: string, state: string) => void;
}) {
  const [decision, setDecision] = useState('Acceptée');
  const [person, setPerson] = useState('');
  const [date, setDate] = useState('');
  const [proof, setProof] = useState('');
  const [comment, setComment] = useState('');
  const valid = person && date && proof && comment;
  return (
    <ModalShell
      title="Enregistrer la décision client"
      eyebrow={`VERSION EXACTE · ${id} v2`}
      close={close}
      dirty={!!(person || date || proof || comment)}
      footer={
        <>
          <Button onClick={close}>Annuler</Button>
          <Button
            kind="primary"
            disabled={!valid}
            onClick={() => {
              const state =
                decision === 'Acceptée'
                  ? 'accepted'
                  : decision === 'Refusée'
                    ? 'rejected'
                    : decision === 'Expirée'
                      ? 'expired'
                      : 'draft';
              complete(id, state);
              notify(
                decision === 'Acceptée'
                  ? `Décision verrouillée. Créer le contrat depuis ${id} v2 sans ressaisie.`
                  : 'Nouvelle version requise avant poursuite.',
              );
              close();
            }}
          >
            Enregistrer et verrouiller
          </Button>
        </>
      }
    >
      <div className="scope-note">
        <LockKeyhole />
        <p>
          La décision portera uniquement sur <b>{id} v2</b>. Client, contact,
          périmètre, prestations et montants seront repris sans ressaisie si
          elle est acceptée.
        </p>
      </div>
      <label className="field">
        <span>Décision *</span>
        <select value={decision} onChange={(e) => setDecision(e.target.value)}>
          <option>Acceptée</option>
          <option>Modification demandée</option>
          <option>Refusée</option>
          <option>Expirée</option>
        </select>
      </label>
      <div className="form-grid">
        <label className="field">
          <span>Personne ayant décidé *</span>
          <input value={person} onChange={(e) => setPerson(e.target.value)} />
        </label>
        <label className="field">
          <span>Date et heure *</span>
          <input
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Canal *</span>
          <select>
            <option>Email</option>
            <option>Document signé</option>
            <option>Réunion</option>
          </select>
        </label>
        <label className="field">
          <span>Référence précise *</span>
          <input value={proof} onChange={(e) => setProof(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Pièce ou commentaire *</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </label>
      <label className="upload-zone">
        <UploadCloud />
        <b>Joindre la preuve</b>
        <span>Email exporté ou document · version exacte</span>
        <input type="file" />
      </label>
    </ModalShell>
  );
}

function SignatureModal({
  id,
  close,
  notify,
  complete,
}: {
  id: string;
  close: () => void;
  notify: (s: string) => void;
  complete: (id: string, state: string) => void;
}) {
  const [signer, setSigner] = useState('');
  const [date, setDate] = useState('');
  const [ref, setRef] = useState('');
  const [file, setFile] = useState(false);
  const valid = signer && date && ref && file;
  return (
    <ModalShell
      title="Enregistrer la signature"
      eyebrow={`${id} · AUCUNE ATTESTATION PRÉCOCHÉE`}
      close={close}
      dirty={!!(signer || date || ref || file)}
      footer={
        <>
          <Button onClick={close}>Annuler</Button>
          <Button
            kind="primary"
            disabled={!valid}
            onClick={() => {
              complete(id, 'signed');
              notify(
                `${id} signé : preuve enregistrée et version verrouillée.`,
              );
              close();
            }}
          >
            Enregistrer la signature
          </Button>
        </>
      }
    >
      <p>
        Chaque information sensible et la preuve du document exact doivent être
        fournies explicitement.
      </p>
      <div className="form-grid">
        <label className="field">
          <span>Signataire *</span>
          <input value={signer} onChange={(e) => setSigner(e.target.value)} />
        </label>
        <label className="field">
          <span>Date *</span>
          <input
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Canal *</span>
          <select>
            <option>Signature manuscrite scannée</option>
            <option>Signature électronique</option>
          </select>
        </label>
        <label className="field">
          <span>Référence *</span>
          <input value={ref} onChange={(e) => setRef(e.target.value)} />
        </label>
      </div>
      <label className="upload-zone">
        <UploadCloud />
        <b>Déposer le contrat signé *</b>
        <span>PDF · version exacte {id}</span>
        <input
          type="file"
          onChange={(e) => setFile(!!e.target.files?.length)}
        />
      </label>
    </ModalShell>
  );
}

function FormModal({
  title,
  eyebrow,
  close,
  notify,
}: {
  title: string;
  eyebrow: string;
  close: () => void;
  notify: (s: string) => void;
}) {
  const [name, setName] = useState('AgroNova SRL');
  return (
    <ModalShell
      title={title}
      eyebrow={eyebrow}
      close={close}
      dirty
      footer={
        <>
          <Button onClick={close}>Annuler</Button>
          <Button
            kind="primary"
            disabled={!name.trim()}
            onClick={() => {
              notify('Fiche client enregistrée avec historique avant/après.');
              close();
            }}
          >
            <Save />
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="form-grid">
        {[
          'Raison sociale *',
          'Forme juridique *',
          'Code fiscal *',
          'Statut TVA *',
          'Adresse *',
          'Pays *',
          'Site web',
          'Secteur',
          'Effectif',
          'Nombre de sites',
        ].map((x, i) => (
          <label className="field" key={x}>
            <span>{x}</span>
            <input
              value={i === 0 ? name : undefined}
              onChange={i === 0 ? (e) => setName(e.target.value) : undefined}
            />
          </label>
        ))}
      </div>
      <h3>Contact principal</h3>
      <div className="form-grid">
        {['Nom *', 'Fonction', 'Email *', 'Téléphone'].map((x) => (
          <label className="field" key={x}>
            <span>{x}</span>
            <input />
          </label>
        ))}
      </div>
    </ModalShell>
  );
}

function CatalogModal({
  id,
  close,
  notify,
}: {
  id: string;
  close: () => void;
  notify: (s: string) => void;
}) {
  return (
    <ModalShell
      title={id === 'new' ? 'Nouveau service' : id}
      eyebrow="SERVICE ET TARIF VERSIONNÉS"
      close={close}
      dirty
      footer={
        <>
          <Button onClick={close}>Annuler</Button>
          <Button
            onClick={() => {
              notify('Brouillon tarifaire enregistré.');
              close();
            }}
          >
            Enregistrer le brouillon
          </Button>
          <Button
            kind="primary"
            onClick={() => {
              notify(
                'Version activée après confirmation ; l’ancienne reste archivée.',
              );
              close();
            }}
          >
            Activer la version
          </Button>
        </>
      }
    >
      <div className="form-grid">
        {[
          'Nom du service *',
          'Code *',
          'Devise *',
          'TVA *',
          'Début de validité *',
          'Fin de validité',
          'Consultant / jour',
          'Auditeur / jour',
          'Expert / jour',
          'Hébergement',
          'Indemnité',
          'Traduction / page',
          'Commission',
          'Conditions obligatoires',
        ].map((x) => (
          <label className="field" key={x}>
            <span>{x}</span>
            <input />
          </label>
        ))}
      </div>
    </ModalShell>
  );
}

function InviteModal({
  close,
  notify,
}: {
  close: () => void;
  notify: (s: string) => void;
}) {
  const [email, setEmail] = useState('');
  const valid = /^[^@]+@[^@]+\.[^@]+$/.test(email);
  return (
    <ModalShell
      title="Inviter un utilisateur"
      eyebrow="ACCÈS INTERNE NOMINATIF"
      close={close}
      dirty={!!email}
      footer={
        <>
          <Button onClick={close}>Annuler</Button>
          <Button
            kind="primary"
            disabled={!valid}
            onClick={() => {
              notify(`Invitation envoyée à ${email}, valable 7 jours.`);
              close();
            }}
          >
            <Send />
            Envoyer
          </Button>
        </>
      }
    >
      <label className="field">
        <span>Email professionnel *</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={email.length > 0 && !valid}
        />
        {email && !valid && (
          <small className="error-text">
            Saisissez une adresse email valide.
          </small>
        )}
      </label>
      <div className="scope-note">
        <ShieldCheck />
        <p>
          Droits applicatifs uniformes dans l’unique espace PRISMA Consultant.
          Expiration automatique après 7 jours.
        </p>
      </div>
    </ModalShell>
  );
}

function DocumentActions({
  id,
  notify,
}: {
  id: string;
  notify: (s: string) => void;
}) {
  return (
    <>
      <dl className="facts">
        <div>
          <dt>Identifiant</dt>
          <dd>{id}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>v2 · non remplacée</dd>
        </div>
        <div>
          <dt>Statut</dt>
          <dd>Approuvé</dd>
        </div>
        <div>
          <dt>Auteur / approbateur</dt>
          <dd>Elena Rusu / Dan Popescu</dd>
        </div>
        <div>
          <dt>Empreinte</dt>
          <dd>sha256:7e34…c091</dd>
        </div>
        <div>
          <dt>Indexation</dt>
          <dd>Terminée · 15/08 15:06</dd>
        </div>
        <div>
          <dt>Éligibilité</dt>
          <dd>Oui · périmètre AgroNova</dd>
        </div>
        <div>
          <dt>Modèle source</dt>
          <dd>DOC-BASE v5</dd>
        </div>
      </dl>
      <div className="document-actions">
        {[
          'Approuver',
          'Rejeter',
          'Créer une version',
          'Indexer / réindexer',
          'Retirer du corpus',
          'Consulter l’erreur',
          'Télécharger',
          'Historique',
        ].map((x) => (
          <Button
            key={x}
            onClick={() =>
              notify(`${x} : action simulée et journalisée pour ${id}.`)
            }
          >
            {x}
          </Button>
        ))}
      </div>
      <p className="config-note">
        Conservation : configuration métier à valider. Aucune durée de 10 ans
        n’est affirmée par défaut.
      </p>
    </>
  );
}

function CaseTable() {
  return (
    <div className="case-table">
      <table>
        <thead>
          <tr>
            <th>Cas</th>
            <th>Flux</th>
            <th>Référence manuelle</th>
            <th>PRISMA</th>
            <th>Extraction</th>
            <th>Traçabilité</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 20 }, (_, i) => (
            <tr key={i}>
              <td>CAS-{String(i + 1).padStart(2, '0')}</td>
              <td>{i % 3 === 0 ? 'HACCP' : 'ISO 22000'}</td>
              <td>{56 + i * 2} min</td>
              <td>{20 + i} min</td>
              <td>{i < 16 ? '93 %' : 'À exécuter'}</td>
              <td>{i < 16 ? 'Complète' : 'À exécuter'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AssistantModal({
  context,
  close,
  open,
}: {
  context: string;
  close: () => void;
  open: (k: ModalKind, d?: string) => void;
}) {
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState(
    'La prochaine action dépend de l’état affiché. Je peux expliquer une preuve ou un blocage sans approuver ni modifier le dossier.',
  );
  const send = () =>
    setAnswer(
      /prix|tarif|tva/.test(q.toLowerCase())
        ? 'Je ne calcule pas les prix. Ouvrez le snapshot déterministe du dossier.'
        : `Dans le contexte « ${context} », je peux m’appuyer uniquement sur les données et documents approuvés visibles.`,
    );
  return (
    <ModalShell
      title="PRISMA Assistant"
      eyebrow="LECTURE SEULE · CONTEXTE CONTRÔLÉ"
      close={close}
    >
      <div className="assistant-context">
        <Sparkles />
        <span>
          <small>PÉRIMÈTRE ACTUEL</small>
          <b>{context}</b>
        </span>
      </div>
      <div className="assistant-answer">
        <b>{answer}</b>
        <p>L’assistant n’approuve, ne calcule et ne change aucun état.</p>
        <button onClick={() => open('event', 'assistant-source-1')}>
          1 · Journal du contexte
        </button>
        <button onClick={() => open('document', 'assistant-source-2')}>
          2 · Source approuvée
        </button>
      </div>
      <label className="assistant-input">
        <span className="sr-only">Question</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Question dans ce périmètre"
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <Button kind="primary" onClick={send} ariaLabel="Envoyer">
          <Send />
        </Button>
      </label>
    </ModalShell>
  );
}

function SearchModal({
  close,
  go,
}: {
  close: () => void;
  go: (p: string) => void;
}) {
  const [q, setQ] = useState('');
  const results = [
    ...requests.map((r) => ({
      label: `${r.ref} · ${r.client}`,
      path: `/request/${r.ref}/${r.stage}`,
      type: 'Demande',
    })),
    ...offersSeed.map((o) => ({
      label: `${o.id} · ${o.client}`,
      path: `/offers/${o.id}`,
      type: 'Offre',
    })),
    ...contractsSeed.map((c) => ({
      label: `${c.id} · ${c.client}`,
      path: `/contracts/${c.id}`,
      type: 'Contrat',
    })),
  ].filter((x) => x.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <ModalShell
      title="Recherche globale"
      eyebrow="CLIENT, DOCUMENT OU RÉFÉRENCE"
      close={close}
    >
      <label className="search-large">
        <Search />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ex. REQ-0280 ou AgroNova"
        />
      </label>
      <div className="search-results">
        {results.slice(0, 8).map((x) => (
          <button
            key={x.path}
            onClick={() => {
              close();
              go(x.path);
            }}
          >
            <Search />
            <span>
              <b>{x.label}</b>
              <small>{x.type}</small>
            </span>
            <ArrowRight />
          </button>
        ))}
        {!results.length && (
          <Empty
            title="Aucun résultat"
            text="Vérifiez la référence ou le nom recherché."
          />
        )}
      </div>
    </ModalShell>
  );
}

export function PrismaCertUiBaseline() {
  const initial = routeInfo();
  const [route, setRoute] = useState(initial.path);
  const [query, setQuery] = useState(initial.query);
  const [compact, setCompact] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [locale, setLocaleState] = useState<Locale>(
    initial.query.get('lang') === 'ro' ? 'ro' : 'fr',
  );
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState('');
  const trigger = useRef<HTMLElement | null>(null);
  const [analysis, setAnalysis] = useState<Record<string, AnalysisState>>(
    Object.fromEntries(requests.map((r) => [r.ref, r.analysis])),
  );
  const [fieldSets, setFieldSets] = useState<Record<string, ReviewField[]>>({
    'REQ-0280': fructFields,
    'REQ-0281': baseFields,
  });
  const [offerStates, setOfferStates] = useState<Record<string, string>>(
    Object.fromEntries(offersSeed.map((o) => [o.id, o.status])),
  );
  const [contractStates, setContractStates] = useState<Record<string, string>>(
    Object.fromEntries(contractsSeed.map((c) => [c.id, c.status])),
  );
  useEffect(() => {
    const sync = () => {
      const r = routeInfo();
      setRoute(r.path);
      setQuery(r.query);
      if (r.query.get('lang') === 'ro') setLocaleState('ro');
    };
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(id);
  }, [toast]);
  const go = (path: string) => {
    window.location.hash = path.startsWith('#') ? path : `#${path}`;
    setRoute(path.split('?')[0]);
    setQuery(new URLSearchParams(path.split('?')[1] || ''));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const setLocale = (l: Locale) => {
    setLocaleState(l);
    const suffix = l === 'ro' ? '?lang=ro' : '';
    go(`${route}${suffix}`);
  };
  const open = (kind: ModalKind, data?: string) => {
    trigger.current = document.activeElement as HTMLElement;
    setModal({ kind, data });
  };
  const close = () => {
    setModal(null);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  const notify = (s: string) => setToast(s);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        open('search');
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  const parts = route.split('/').filter(Boolean);
  let page = (parts[0] || 'dashboard') as PageId;
  if (
    ![
      'dashboard',
      'requests',
      'request',
      'clients',
      'offers',
      'contracts',
      'projects',
      'documents',
      'catalog',
      'activity',
      'users',
      'coverage',
    ].includes(page)
  )
    page = 'dashboard';
  const req = requests.find((r) => r.ref === parts[1]) || requests[0];
  const stage = (
    stages.some((s) => s.id === parts[2]) ? parts[2] : req.stage
  ) as Stage;
  const fields = fieldSets[req.ref] || baseFields;
  const context =
    page === 'request'
      ? `${req.ref} · ${req.client} · ${stages.find((s) => s.id === stage)?.label}`
      : page === 'offers'
        ? `${parts[1] || 'Registre des offres'}`
        : page === 'contracts'
          ? `${parts[1] || 'Registre des contrats'}`
          : pageLabels[page];
  const saveField = (
    id: string,
    value: string,
    state: ReviewField['state'],
    reason: string,
  ) => {
    setFieldSets((all) => ({
      ...all,
      [req.ref]: fields.map((f) =>
        f.id === id
          ? {
              ...f,
              retained: value,
              state,
              rationale: reason,
              reviewer: 'Dan Popescu',
              reviewedAt: '15 août 2026 · maintenant',
            }
          : f,
      ),
    }));
    close();
    notify(
      'Décision enregistrée. Toute dépendance de calcul concernée est maintenant signalée comme invalide.',
    );
  };
  let content: ReactNode = <Dashboard go={go} open={open} />;
  if (page === 'requests') content = <RequestsPage go={go} open={open} />;
  else if (page === 'request')
    content = (
      <RequestPage
        request={req}
        stage={stage}
        analysis={analysis[req.ref]}
        setAnalysis={(s) => setAnalysis((x) => ({ ...x, [req.ref]: s }))}
        fields={fields}
        open={open}
        go={go}
        notify={notify}
      />
    );
  else if (page === 'clients')
    content = (
      <ClientsPage selected={parts[1]} go={go} open={open} notify={notify} />
    );
  else if (page === 'offers')
    content = (
      <OffersPage
        selected={parts[1]}
        go={go}
        open={open}
        notify={notify}
        states={offerStates}
        setStates={setOfferStates}
      />
    );
  else if (page === 'contracts')
    content = (
      <ContractsPage
        selected={parts[1]}
        go={go}
        open={open}
        notify={notify}
        states={contractStates}
        setStates={setContractStates}
      />
    );
  else if (page === 'projects')
    content = <ProjectsPage go={go} selected={parts[1]} />;
  else if (page === 'documents')
    content = (
      <DocumentsPage
        open={open}
        notify={notify}
        initialScenario={query.get('scenario')}
      />
    );
  else if (page === 'catalog')
    content = <CatalogPage open={open} notify={notify} />;
  else if (page === 'activity')
    content = <ActivityPage open={open} notify={notify} />;
  else if (page === 'users')
    content = <UsersPage open={open} notify={notify} />;
  else if (page === 'coverage') content = <CoveragePage go={go} />;
  return (
    <main className="app">
      <Sidebar
        page={page}
        compact={compact}
        setCompact={setCompact}
        go={go}
        locale={locale}
        mobileOpen={mobileNav}
        closeMobile={() => setMobileNav(false)}
      />
      <section className="app-main">
        <Topbar
          context={context}
          open={open}
          locale={locale}
          setLocale={setLocale}
          openMobile={() => setMobileNav(true)}
        />
        <div className="content">
          {locale === 'ro' && (
            <div className="locale-banner">
              <Languages />
              Scenariu de localizare în limba română activ. Datele și dovezile
              originale rămân neschimbate.
            </div>
          )}
          {content}
        </div>
      </section>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 />
          {toast}
        </div>
      )}
      <AppModal
        modal={modal}
        close={close}
        open={open}
        fields={fields}
        saveField={saveField}
        go={go}
        notify={notify}
        context={context}
        setOfferState={(id, state) =>
          setOfferStates((s) => ({ ...s, [id]: state }))
        }
        setContractState={(id, state) =>
          setContractStates((s) => ({ ...s, [id]: state }))
        }
      />
    </main>
  );
}
