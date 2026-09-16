import { randomUUID } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
import { ClerkInvitationProvider } from '../dist/identity/clerk-invitation.adapter.js';

// Explicit, controlled delivery only. Never print provider payloads or links.
const email = process.env.CLERK_SMOKE_RECIPIENT?.trim().toLowerCase();
if (!process.env.CLERK_SECRET_KEY?.startsWith('sk_test_') || !email) {
  throw new Error(
    'A Clerk test key and controlled smoke recipient are required.',
  );
}
const provider = new ClerkInvitationProvider();
const intent = { reference: randomUUID(), email, expiresInDays: 1 };
let confirmedIssue = false;
let confirmedRevocation;
try {
  let issued = await provider.issue(intent);
  if (issued.kind === 'uncertain') issued = await provider.inspect(intent);
  confirmedIssue = issued.kind === 'confirmed' && issued.status === 'pending';
} finally {
  // Never retry issuance. Attempt cleanup even after uncertain delivery.
  const revoked = await provider.revoke(intent);
  confirmedRevocation =
    revoked.kind === 'confirmed' && revoked.status === 'revoked';
  console.log(
    JSON.stringify({
      checkedAt: new Date().toISOString(),
      providerIssueConfirmed: confirmedIssue,
      providerRevocationConfirmed: confirmedRevocation,
      mailboxReceiptVerified: false,
      expiryVerified: false,
      applicationAdmissionVerified: false,
    }),
  );
}
if (!confirmedIssue || !confirmedRevocation) {
  console.error(
    'Provider proof incomplete. Inspect the controlled invitation in Clerk before another run; do not resend blindly.',
  );
  process.exitCode = 1;
}
