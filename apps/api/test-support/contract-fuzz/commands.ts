import { randomUUID } from 'node:crypto';
import * as fc from 'fast-check';
import {
  canonical,
  expectDenial,
  short,
  type Reply,
} from '../model-fuzz/checks.js';
import {
  assignmentAction,
  bundleAssignments,
  checkStep,
  COMPANIES,
  denialInvariant,
  granted,
  integer,
  InvariantViolation,
  MEMBERS,
  MISSING_ID,
  object,
  setGrant,
  SIGNED_ON,
  text,
  warningsFor,
  type Bundle,
  type CompanyKey,
  type ContractApi,
  type ContractModel,
  type SourceModel,
  type ExpectedEvent,
  type MemberKey,
  type Model,
  type StepOutcome,
} from './world.js';

type FuzzCommand = fc.AsyncCommand<Model, ContractApi>;
const NOTHING: StepOutcome = { touched: [], events: [] };
type Who = MemberKey | { able: number };
type Aim = { index: number; foreign: boolean };

abstract class Step implements FuzzCommand {
  protected readonly needsContract: boolean = false;
  check(model: Readonly<Model>): boolean {
    return !this.needsContract || model.contracts.length > 0;
  }
  async run(model: Model, api: ContractApi): Promise<void> {
    await checkStep(model, api, await this.act(model, api));
  }
  protected abstract act(model: Model, api: ContractApi): Promise<StepOutcome>;
  abstract toString(): string;
}

function describeWho(who: Who) {
  return typeof who === 'string' ? who : `able#${who.able}`;
}
function resolveWho(model: Readonly<Model>, who: Who, bundle: Bundle) {
  if (typeof who === 'string') return who;
  const able = MEMBERS.filter((member) =>
    granted(model, member, model.context[member], bundle),
  );
  const pool = able.length > 0 ? able : MEMBERS;
  const member = pool[who.able % pool.length];
  if (!member) throw new Error('No member.');
  return member;
}
function pickSource(
  api: ContractApi,
  company: CompanyKey,
  aim: Aim,
  want: 'direct' | 'accepted' | 'pending',
) {
  const pool = api.world.sources.filter((source) => {
    if ((source.company === company) === aim.foreign) return false;
    if (want === 'accepted') return source.acceptedOfferVersionId !== null;
    if (want === 'pending') return source.pendingOfferVersionId !== null;
    return (
      source.acceptedOfferVersionId === null &&
      source.pendingOfferVersionId === null
    );
  });
  const source = pool[aim.index % pool.length];
  if (!source) throw new Error('No source.');
  return source;
}
function pickContract(model: Model, company: CompanyKey, aim: Aim) {
  const pool = model.contracts.filter(
    (contract) => (contract.company === company) !== aim.foreign,
  );
  const chosen = pool.length > 0 ? pool : model.contracts;
  const contract = chosen[aim.index % chosen.length];
  if (!contract) throw new Error('No Contract.');
  return contract;
}
function issueKey(
  model: Model,
  api: ContractApi,
  member: MemberKey,
  slot: number | null,
) {
  if (slot === null) return api.nextKey();
  const pool = model.refused.filter((item) => item.member === member);
  const found = pool.length === 0 ? undefined : pool[slot % pool.length];
  return found?.key ?? api.nextKey();
}
function noteRefusal(model: Model, member: MemberKey, key: string) {
  if (
    !model.committed.some((item) => item.member === member && item.key === key)
  )
    model.refused.push({ member, key });
}
function remember(
  model: Model,
  member: MemberKey,
  company: CompanyKey,
  key: string,
  path: string,
  body: unknown,
  receipt: unknown,
  status: number,
) {
  model.refused = model.refused.filter(
    (item) => item.member !== member || item.key !== key,
  );
  model.committed.push({
    member,
    company,
    key,
    method: 'POST',
    path,
    body,
    receipt,
    status,
  });
}
async function refuse(input: {
  model: Model;
  reply: Reply;
  status: 403 | 404 | 409;
  invariant: InvariantName;
  what: string;
  member?: MemberKey;
  key?: string;
  code?: string;
  twin?: () => Promise<Reply>;
}) {
  await expectDenial({
    reply: input.reply,
    status: input.status,
    invariant: input.invariant,
    what: input.what,
    twin: input.twin,
  });
  if (
    input.code !== undefined &&
    object(input.reply.body, input.what).code !== input.code
  )
    throw new InvariantViolation(
      input.invariant,
      `${input.what}: expected ${input.code}, got ${short(input.reply)}`,
    );
  if (input.member && input.key)
    noteRefusal(input.model, input.member, input.key);
}
type InvariantName = import('./world.js').Invariant;

function authority(
  model: Model,
  member: MemberKey,
  company: CompanyKey,
  bundle: Bundle,
): import('./world.js').Invariant | undefined {
  return granted(model, member, company, bundle)
    ? undefined
    : denialInvariant(model, member, company, [bundle]);
}
function event(
  action: string,
  company: CompanyKey,
  member: MemberKey,
): ExpectedEvent {
  return { action, company, member };
}
function adopt(
  created: Record<string, unknown>,
  source: SourceModel,
): ContractModel {
  const version = object(created.version, 'version');
  return {
    id: text(created.id, 'id'),
    company: source.company,
    opportunityId: source.opportunityId,
    origin: created.origin === 'DIRECT' ? 'DIRECT' : 'ACCEPTED_OFFER',
    snapshotId: source.snapshotId,
    revision: integer(created.revision, 'revision'),
    headVersionId: text(version.id, 'version id'),
    headNumber: integer(version.versionNumber, 'version number'),
    decision: 'PENDING',
    execution: 'NOT_EXECUTED',
    linked: false,
    events: ['contract.created', 'contract_version.created'],
  };
}

class CreateContract extends Step {
  constructor(
    private readonly who: Who,
    private readonly aim: Aim,
    private readonly direct: boolean,
    private readonly mismatch: boolean,
    private readonly keySlot: number | null,
  ) {
    super();
  }
  protected async act(model: Model, api: ContractApi) {
    const member = resolveWho(model, this.who, 'preparer');
    const company = model.context[member];
    const source = pickSource(
      api,
      company,
      this.aim,
      this.direct
        ? this.mismatch
          ? 'accepted'
          : 'direct'
        : this.mismatch
          ? 'pending'
          : 'accepted',
    );
    const key = issueKey(model, api, member, this.keySlot);
    const path = `/contracts/opportunities/${source.opportunityId}${this.direct ? '/direct' : ''}`;
    const offerVersionId = this.direct
      ? null
      : this.mismatch
        ? source.pendingOfferVersionId
        : source.acceptedOfferVersionId;
    const body = this.direct
      ? {
          recipient: { kind: 'PRIMARY' },
          pricingSnapshotId: source.snapshotId,
          directReason: 'Fictional direct reason',
          scopeNote: 'Fictional direct scope',
          commercialConditions: 'Fictional direct conditions',
        }
      : { acceptedOfferVersionId: offerVersionId };
    const reply = await api.send(member, path, {
      method: 'POST',
      company,
      key,
      body,
    });
    const what = `${member} creates a ${this.direct ? 'direct' : 'offer'} Contract`;
    const hidden = source.company !== company;
    const denied = authority(model, member, company, 'preparer');
    if (denied || hidden) {
      await refuse({
        model,
        reply,
        status: denied ? 403 : 404,
        invariant: denied ?? 'identical-denial',
        what,
        member,
        key,
        twin: () =>
          api.send(
            member,
            `/contracts/opportunities/${MISSING_ID}${this.direct ? '/direct' : ''}`,
            {
              method: 'POST',
              company,
              key: api.nextKey(),
              body,
            },
          ),
      });
      return NOTHING;
    }
    const existing = model.contracts.find(
      (contract) => contract.opportunityId === source.opportunityId,
    );
    // Offer resolution refuses an unaccepted version before the existing
    // Contract is considered. A direct command sees the existing Contract
    // before the Accepted Offer.
    const pendingOffer = !this.direct && this.mismatch;
    const acceptedOffer = this.direct && source.acceptedOfferVersionId !== null;
    if (pendingOffer || existing || acceptedOffer) {
      await refuse({
        model,
        reply,
        status: 409,
        invariant: 'one-contract',
        what,
        member,
        key,
        code: pendingOffer
          ? 'OFFER_NOT_ACCEPTED'
          : existing
            ? 'CONTRACT_ALREADY_EXISTS'
            : 'ACCEPTED_OFFER_EXISTS',
      });
      return NOTHING;
    }
    if (reply.status !== 201)
      throw new InvariantViolation(
        'one-contract',
        `${what}: expected 201, got ${short(reply)}`,
      );
    const contract = adopt(object(reply.body, what), source);
    model.contracts.push(contract);
    remember(model, member, company, key, path, body, reply.body, 201);
    return { touched: [contract], events: [] };
  }
  toString() {
    return `create(${describeWho(this.who)} ${this.direct ? 'direct' : 'offer'}${this.mismatch ? ' mismatch' : ''} #${this.aim.index}${this.aim.foreign ? ' foreign' : ''})`;
  }
}

class Decide extends Step {
  protected override readonly needsContract = true;
  constructor(
    private readonly who: Who,
    private readonly aim: Aim,
    private readonly approve: boolean,
    private readonly stale: boolean,
    private readonly keySlot: number | null,
  ) {
    super();
  }
  protected async act(model: Model, api: ContractApi) {
    const member = resolveWho(model, this.who, 'approver');
    const company = model.context[member];
    const contract = pickContract(model, company, this.aim);
    const key = issueKey(model, api, member, this.keySlot);
    const expected =
      this.stale && contract.revision > 1
        ? contract.revision - 1
        : contract.revision;
    const path = `/contracts/opportunities/${contract.opportunityId}/versions/${contract.headVersionId}/${this.approve ? 'approve' : 'reject'}`;
    const body = this.approve
      ? {
          expectedContractRevision: expected,
          acknowledgedWarningCodes: warningsFor(contract.origin),
        }
      : { expectedContractRevision: expected, reason: 'Fictional refusal' };
    const reply = await api.send(member, path, {
      method: 'POST',
      company,
      key,
      body,
    });
    const what = `${member} ${this.approve ? 'approves' : 'rejects'} ${contract.id}`;
    return settleVersion({
      model,
      api,
      member,
      company,
      contract,
      key,
      path,
      body,
      reply,
      what,
      bundle: 'approver',
      expected,
      staleCode: 'STALE_CONTRACT_REVISION',
      admit: () =>
        contract.decision === 'PENDING'
          ? { kind: 'ok' }
          : {
              kind: 'conflict',
              code: 'CONTRACT_VERSION_ALREADY_DECIDED',
              invariant: 'version-state',
            },
      apply: () => {
        contract.decision = this.approve ? 'APPROVED' : 'REJECTED';
        contract.revision += 1;
        contract.events.push(
          this.approve
            ? 'contract_version.approved'
            : 'contract_version.rejected',
        );
      },
    });
  }
  toString() {
    return `${this.approve ? 'approve' : 'reject'}(${describeWho(this.who)} #${this.aim.index}${this.stale ? ' stale' : ''})`;
  }
}

class Sign extends Step {
  protected override readonly needsContract = true;
  constructor(
    private readonly who: Who,
    private readonly aim: Aim,
    private readonly keySlot: number | null,
  ) {
    super();
  }
  protected async act(model: Model, api: ContractApi) {
    const member = resolveWho(model, this.who, 'approver');
    const company = model.context[member];
    const contract = pickContract(model, company, this.aim);
    const key = issueKey(model, api, member, this.keySlot);
    const path = `/contracts/opportunities/${contract.opportunityId}/versions/${contract.headVersionId}/signature`;
    const body = {
      expectedContractRevision: contract.revision,
      providerSignatoryLabel: 'Fictional provider',
      clientSignatoryLabel: 'Fictional client',
      providerSignedOn: SIGNED_ON,
      clientSignedOn: SIGNED_ON,
      note: null,
      acknowledgedWarningCodes: [],
    };
    const reply = await api.send(member, path, {
      method: 'POST',
      company,
      key,
      body,
    });
    return settleVersion({
      model,
      api,
      member,
      company,
      contract,
      key,
      path,
      body,
      reply,
      what: `${member} signs ${contract.id}`,
      bundle: 'approver',
      expected: contract.revision,
      staleCode: 'STALE_CONTRACT_REVISION',
      admit: () =>
        contract.decision === 'APPROVED' &&
        contract.execution === 'NOT_EXECUTED'
          ? { kind: 'ok' }
          : {
              kind: 'conflict',
              invariant: 'version-state',
              code:
                contract.execution === 'EXECUTED'
                  ? 'CONTRACT_VERSION_ALREADY_EXECUTED'
                  : 'CONTRACT_VERSION_NOT_APPROVED',
            },
      apply: () => {
        contract.execution = 'EXECUTED';
        contract.revision += 1;
        contract.events.push('contract_version.signature_recorded');
      },
    });
  }
  toString() {
    return `sign(${describeWho(this.who)} #${this.aim.index})`;
  }
}

class NewVersion extends Step {
  protected override readonly needsContract = true;
  constructor(
    private readonly who: Who,
    private readonly aim: Aim,
    private readonly keySlot: number | null,
  ) {
    super();
  }
  protected async act(model: Model, api: ContractApi) {
    const member = resolveWho(model, this.who, 'preparer');
    const company = model.context[member];
    const contract = pickContract(model, company, this.aim);
    const key = issueKey(model, api, member, this.keySlot);
    const path = `/contracts/opportunities/${contract.opportunityId}/versions`;
    const body =
      contract.origin === 'DIRECT'
        ? {
            expectedContractRevision: contract.revision,
            pricingSnapshotId: contract.snapshotId,
            scopeNote: 'Fictional direct scope',
            commercialConditions: 'Fictional direct conditions',
          }
        : { expectedContractRevision: contract.revision };
    const reply = await api.send(member, path, {
      method: 'POST',
      company,
      key,
      body,
    });
    return settleVersion({
      model,
      api,
      member,
      company,
      contract,
      key,
      path,
      body,
      reply,
      what: `${member} versions ${contract.id}`,
      bundle: 'preparer',
      expected: contract.revision,
      staleCode: 'STALE_CONTRACT_REVISION',
      admit: () =>
        contract.execution === 'EXECUTED'
          ? {
              kind: 'conflict',
              invariant: 'version-state',
              code: 'CONTRACT_EXECUTED',
            }
          : { kind: 'ok' },
      apply: (receipt) => {
        const created = object(receipt, 'receipt');
        contract.headVersionId = text(created.contractVersionId, 'version id');
        contract.headNumber = integer(created.versionNumber, 'version number');
        contract.decision = 'PENDING';
        contract.revision = integer(created.revision, 'revision');
        contract.events.push('contract_version.created');
      },
    });
  }
  toString() {
    return `version(${describeWho(this.who)} #${this.aim.index})`;
  }
}

class Quality extends Step {
  protected override readonly needsContract = true;
  constructor(
    private readonly who: Who,
    private readonly aim: Aim,
  ) {
    super();
  }
  protected async act(model: Model, api: ContractApi) {
    const member = resolveWho(model, this.who, 'preparer');
    const company = model.context[member];
    const contract = pickContract(model, company, this.aim);
    const path = `/contracts/opportunities/${contract.opportunityId}/versions/${contract.headVersionId}/quality-checks`;
    const reply = await api.send(member, path, {
      method: 'POST',
      company,
      key: api.nextKey(),
      body: {},
    });
    const what = `${member} checks ${contract.id}`;
    const hidden = contract.company !== company;
    const denied =
      authority(model, member, company, 'preparer') &&
      authority(model, member, company, 'approver');
    if (denied || hidden) {
      await refuse({
        model,
        reply,
        status: denied ? 403 : 404,
        invariant: denied ?? 'identical-denial',
        what,
      });
      return NOTHING;
    }
    if (reply.status !== 201)
      throw new InvariantViolation(
        'model-agreement',
        `${what}: expected 201, got ${short(reply)}`,
      );
    return { touched: [contract], events: [] };
  }
  toString() {
    return `quality(${describeWho(this.who)} #${this.aim.index})`;
  }
}

class LinkProject extends Step {
  protected override readonly needsContract = true;
  constructor(
    private readonly who: Who,
    private readonly aim: Aim,
  ) {
    super();
  }
  protected async act(model: Model, api: ContractApi) {
    const member = resolveWho(model, this.who, 'preparer');
    const company = model.context[member];
    const contract = pickContract(model, company, this.aim);
    const source = api.world.sources.find(
      (item) => item.opportunityId === contract.opportunityId,
    );
    const projectId = source?.projectId ?? MISSING_ID;
    const path = `/contracts/opportunities/${contract.opportunityId}/projects`;
    const body = { projectId, expectedContractRevision: contract.revision };
    const reply = await api.send(member, path, {
      method: 'POST',
      company,
      key: api.nextKey(),
      body,
    });
    const what = `${member} links a Project to ${contract.id}`;
    const hidden = contract.company !== company;
    const denied = authority(model, member, company, 'preparer');
    if (denied || hidden) {
      await refuse({
        model,
        reply,
        status: denied ? 403 : 404,
        invariant: denied ?? 'identical-denial',
        what,
      });
      return NOTHING;
    }
    if (contract.execution !== 'EXECUTED') {
      await refuse({
        model,
        reply,
        status: 409,
        invariant: 'project-link',
        what,
        code: 'CONTRACT_NOT_EXECUTED',
      });
      return NOTHING;
    }
    if (contract.linked) {
      await refuse({
        model,
        reply,
        status: 409,
        invariant: 'project-link',
        what,
        code: 'CONTRACT_PROJECT_ALREADY_LINKED',
      });
      return NOTHING;
    }
    if (reply.status !== 201)
      throw new InvariantViolation(
        'project-link',
        `${what}: expected 201, got ${short(reply)}`,
      );
    contract.linked = true;
    contract.revision += 1;
    contract.events.push('contract_project.linked');
    return { touched: [contract], events: [] };
  }
  toString() {
    return `link(${describeWho(this.who)} #${this.aim.index})`;
  }
}

class ReadContract extends Step {
  protected override readonly needsContract = true;
  constructor(
    private readonly member: MemberKey,
    private readonly aim: Aim,
  ) {
    super();
  }
  protected async act(model: Model, api: ContractApi) {
    const company = model.context[this.member];
    const contract = pickContract(model, company, this.aim);
    const reply = await api.send(
      this.member,
      `/contracts/opportunities/${contract.opportunityId}`,
      { company },
    );
    const hidden = contract.company !== company;
    const denied =
      authority(model, this.member, company, 'preparer') &&
      authority(model, this.member, company, 'approver');
    if (denied || hidden) {
      await refuse({
        model,
        reply,
        status: denied ? 403 : 404,
        invariant: denied ?? 'identical-denial',
        what: `${this.member} reads ${contract.id}`,
        twin: () =>
          api.send(this.member, `/contracts/opportunities/${MISSING_ID}`, {
            company,
            key: api.nextKey(),
          }),
      });
      return NOTHING;
    }
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `read failed: ${short(reply)}`,
      );
    return { touched: [contract], events: [] };
  }
  toString() {
    return `read(${this.member} #${this.aim.index})`;
  }
}

class Replay extends Step {
  protected override readonly needsContract = true;
  constructor(private readonly pick: number) {
    super();
  }
  check(model: Readonly<Model>): boolean {
    return model.committed.length > 0;
  }
  protected async act(model: Model, api: ContractApi) {
    const committed = model.committed[this.pick % model.committed.length];
    if (!committed) return NOTHING;
    const reply = await api.send(committed.member, committed.path, {
      method: 'POST',
      company: committed.company,
      key: committed.key,
      body: committed.body,
    });
    const bundle =
      committed.path.includes('/approve') ||
      committed.path.includes('/reject') ||
      committed.path.endsWith('/signature')
        ? 'approver'
        : 'preparer';
    const denied = authority(
      model,
      committed.member,
      committed.company,
      bundle,
    );
    if (denied) {
      await refuse({
        model,
        reply,
        status: 403,
        invariant: denied,
        what: 'replay',
      });
      return NOTHING;
    }
    if (reply.status !== committed.status)
      throw new InvariantViolation(
        'replay-receipt',
        `replay returned ${short(reply)}`,
      );
    const saved = object(committed.receipt, 'saved receipt');
    const again = object(reply.body, 'replay');
    // Creation replay confirms the same Contract. A later version changes
    // the head the read returns, so that body is not frozen. Version
    // creation ends in `/versions` and returns its own receipt.
    if (!committed.path.includes('/versions')) {
      if (again.id !== saved.id)
        throw new InvariantViolation(
          'replay-receipt',
          'replay named another Contract',
        );
      return NOTHING;
    }
    if (canonical(reply.body) !== canonical(committed.receipt))
      throw new InvariantViolation(
        'replay-receipt',
        `replay returned ${short(reply)}`,
      );
    return NOTHING;
  }
  toString() {
    return `replay(#${this.pick})`;
  }
}

class ReuseKey extends Step {
  constructor(private readonly pick: number) {
    super();
  }
  check(model: Readonly<Model>): boolean {
    return model.committed.length > 0;
  }
  protected async act(model: Model, api: ContractApi) {
    const committed = model.committed[this.pick % model.committed.length];
    if (!committed) return NOTHING;
    const body = object(committed.body, 'body');
    const replacesOffer =
      'acceptedOfferVersionId' in body && !('expectedContractRevision' in body);
    const next = replacesOffer
      ? { ...body, acceptedOfferVersionId: MISSING_ID }
      : 'expectedContractRevision' in body
        ? {
            ...body,
            expectedContractRevision:
              integer(body.expectedContractRevision, 'revision') + 1,
          }
        : { ...body, directReason: 'Fictional other direct reason' };
    const reply = await api.send(committed.member, committed.path, {
      method: 'POST',
      company: committed.company,
      key: committed.key,
      body: next,
    });
    const approverCommand =
      committed.path.includes('/approve') ||
      committed.path.includes('/reject') ||
      committed.path.endsWith('/signature');
    const preparerDenied = authority(
      model,
      committed.member,
      committed.company,
      'preparer',
    );
    const approverDenied = authority(
      model,
      committed.member,
      committed.company,
      'approver',
    );
    const denied = approverCommand
      ? approverDenied
      : committed.path.endsWith('/quality-checks')
        ? preparerDenied && approverDenied
          ? preparerDenied
          : undefined
        : preparerDenied;
    if (denied) {
      await refuse({
        model,
        reply,
        status: 403,
        invariant: denied,
        what: 'key reuse',
      });
      return NOTHING;
    }
    // A missing Offer version is not visible, so the command is refused
    // before the key is compared. A changed body of a visible command conflicts.
    if (reply.status !== (replacesOffer ? 404 : 409))
      throw new InvariantViolation(
        'replay-receipt',
        `key reuse returned ${short(reply)}`,
      );
    return NOTHING;
  }
  toString() {
    return `reuse(#${this.pick})`;
  }
}

class GrantBundle extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
    private readonly bundle: Bundle,
  ) {
    super();
  }
  protected async act(model: Model, api: ContractApi) {
    const reply = await api.send('owner', bundleAssignments(this.bundle), {
      method: 'POST',
      key: randomUUID(),
      body: {
        companyId: api.companyIds[this.company],
        workspaceMembershipId: api.membershipIds[this.member],
      },
    });
    if (reply.status !== 201)
      throw new InvariantViolation(
        'model-agreement',
        `grant failed: ${short(reply)}`,
      );
    const changed = !granted(model, this.member, this.company, this.bundle);
    setGrant(model, this.member, this.company, this.bundle, 'active');
    return {
      touched: [],
      events: changed
        ? [
            event(
              assignmentAction(this.bundle, 'granted'),
              this.company,
              this.member,
            ),
          ]
        : [],
    };
  }
  toString() {
    return `grant(${this.member} ${this.company} ${this.bundle})`;
  }
}

class RevokeBundle extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
    private readonly bundle: Bundle,
  ) {
    super();
  }
  protected async act(model: Model, api: ContractApi) {
    const reply = await api.send(
      'owner',
      `${bundleAssignments(this.bundle)}/${api.membershipIds[this.member]}/${api.companyIds[this.company]}`,
      { method: 'DELETE', key: randomUUID() },
    );
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `revoke failed: ${short(reply)}`,
      );
    const changed = granted(model, this.member, this.company, this.bundle);
    if (changed)
      setGrant(model, this.member, this.company, this.bundle, 'revoked');
    return {
      touched: [],
      events: changed
        ? [
            event(
              assignmentAction(this.bundle, 'revoked'),
              this.company,
              this.member,
            ),
          ]
        : [],
    };
  }
  toString() {
    return `revoke(${this.member} ${this.company} ${this.bundle})`;
  }
}

class SwitchCompany extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
  ) {
    super();
  }
  protected async act(model: Model, api: ContractApi) {
    const reply = await api.send(this.member, '/access/current-actor', {
      company: this.company,
    });
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `company switch failed: ${short(reply)}`,
      );
    model.context[this.member] = this.company;
    return NOTHING;
  }
  toString() {
    return `company(${this.member} ${this.company})`;
  }
}

async function settleVersion(input: {
  model: Model;
  api: ContractApi;
  member: MemberKey;
  company: CompanyKey;
  contract: ContractModel;
  key: string;
  path: string;
  body: unknown;
  reply: Reply;
  what: string;
  bundle: Bundle;
  expected: number;
  staleCode: string;
  admit: () =>
    | { kind: 'ok' }
    | { kind: 'conflict'; invariant: InvariantName; code: string };
  apply: (receipt: unknown) => void;
}): Promise<StepOutcome> {
  const hidden = input.contract.company !== input.company;
  const denied = authority(
    input.model,
    input.member,
    input.company,
    input.bundle,
  );
  if (denied || hidden) {
    await refuse({
      model: input.model,
      reply: input.reply,
      status: denied ? 403 : 404,
      invariant: denied ?? 'identical-denial',
      what: input.what,
      member: input.member,
      key: input.key,
      twin: () =>
        input.api.send(
          input.member,
          input.path.replace(input.contract.opportunityId, MISSING_ID),
          {
            method: 'POST',
            company: input.company,
            key: input.api.nextKey(),
            body: input.body,
          },
        ),
    });
    return NOTHING;
  }
  if (input.expected !== input.contract.revision) {
    await refuse({
      model: input.model,
      reply: input.reply,
      status: 409,
      invariant: 'revisions-grow',
      what: input.what,
      member: input.member,
      key: input.key,
      code: input.staleCode,
    });
    return NOTHING;
  }
  const admission = input.admit();
  if (admission.kind === 'conflict') {
    await refuse({
      model: input.model,
      reply: input.reply,
      status: 409,
      invariant: admission.invariant,
      what: input.what,
      member: input.member,
      key: input.key,
      code: admission.code,
    });
    return NOTHING;
  }
  if (input.reply.status !== 201)
    throw new InvariantViolation(
      'version-state',
      `${input.what}: expected 201, got ${short(input.reply)}`,
    );
  input.apply(input.reply.body);
  remember(
    input.model,
    input.member,
    input.company,
    input.key,
    input.path,
    input.body,
    input.reply.body,
    201,
  );
  return { touched: [input.contract], events: [] };
}

export function fuzzCommands(options: {
  steps: number;
  replayPath: string | undefined;
}) {
  const member = fc.constantFrom(...MEMBERS);
  const who: fc.Arbitrary<Who> = fc.oneof(
    member,
    fc.record({ able: fc.nat({ max: 2 }) }),
  );
  const company = fc.constantFrom(...COMPANIES);
  const bundle = fc.constantFrom(...(['preparer', 'approver'] as const));
  const aim: fc.Arbitrary<Aim> = fc.record({
    index: fc.nat({ max: 5 }),
    foreign: fc.nat({ max: 3 }).map((roll) => roll === 0),
  });
  const slot: fc.Arbitrary<number | null> = fc.oneof(
    { arbitrary: fc.constant(null), weight: 3 },
    { arbitrary: fc.nat({ max: 4 }), weight: 1 },
  );
  const weighted: Array<[number, fc.Arbitrary<FuzzCommand>]> = [
    [
      4,
      fc
        .tuple(who, aim, fc.boolean(), fc.boolean(), slot)
        .map((args) => new CreateContract(...args)),
    ],
    [
      3,
      fc
        .tuple(
          who,
          aim,
          fc.boolean(),
          fc.nat({ max: 4 }).map((n) => n === 0),
          slot,
        )
        .map((args) => new Decide(...args)),
    ],
    [2, fc.tuple(who, aim, slot).map((args) => new Sign(...args))],
    [2, fc.tuple(who, aim, slot).map((args) => new NewVersion(...args))],
    [1, fc.tuple(who, aim).map((args) => new Quality(...args))],
    [2, fc.tuple(who, aim).map((args) => new LinkProject(...args))],
    [1, fc.tuple(member, aim).map((args) => new ReadContract(...args))],
    [2, fc.nat({ max: 5 }).map((index) => new Replay(index))],
    [1, fc.nat({ max: 5 }).map((index) => new ReuseKey(index))],
    [2, fc.tuple(member, company).map((args) => new SwitchCompany(...args))],
    [
      2,
      fc.tuple(member, company, bundle).map((args) => new GrantBundle(...args)),
    ],
    [
      2,
      fc
        .tuple(member, company, bundle)
        .map((args) => new RevokeBundle(...args)),
    ],
  ];
  const steps = weighted.flatMap(([weight, step]) =>
    Array.from({ length: weight }, () => step),
  );
  return fc.commands(steps, {
    size: 'max',
    maxCommands: options.steps,
    ...(options.replayPath === undefined
      ? {}
      : { replayPath: options.replayPath }),
  });
}
