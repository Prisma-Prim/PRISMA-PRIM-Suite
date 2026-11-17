# Subscription document harness activation

The software contract is [Dossier Analysis §25](../product/dossier-analysis-prd.md#25-subscription-backed-document-harness--owner-extension-2026-11-17). Native protocol/browser fixtures are fictional. They prove software behavior, not an actual account grant, provider availability, private-document rights, representative model quality or sufficient subscription capacity.

## Hosted prerequisite

Use an OpenAI-provisioned **public OAuth client** supporting the exact hosted redirect and ChatGPT-plan invocation scopes. The client uses PKCE and token-endpoint authentication `none`. An identity-only client does not authorize inference. This version does not support a confidential client's `client_secret_basic` flow or reinterpret the OSS dynamic loopback registration as hosted approval.

Check actual eligibility with the [official integration route](https://developers.openai.com/siwc/quickstart) and its [hosted/local boundary](https://developers.openai.com/siwc/token-sharing-open-source). Non-commercial use and a public repository do not establish approval. The application does not submit an external application or change its license automatically.

Configure the operator-owned server environment:

| Setting                          | Required value                                                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DOSSIER_HARNESS_ENABLED`        | `true` only after the prerequisites are satisfied                                                                                                        |
| `CHATGPT_PLAN_CLIENT_ID`         | The actual provisioned public client ID; never `dynamic_agent_client`                                                                                    |
| `CHATGPT_PLAN_REDIRECT_URI`      | The Web application's exact `https://…/chatgpt/callback`, approved for that client; numeric-loopback HTTP is allowed only for isolated local development |
| `DOSSIER_HARNESS_ENCRYPTION_KEY` | A securely generated 32-byte key encoded as canonical base64, held in the server's secret store                                                          |

Preserve the encryption key across restarts. Losing or replacing it requires reconnecting accounts. Never put it, OAuth tokens, a source document or a real account's callback URL in Git, logs, screenshots or support transcripts. Existing Clerk/Workspace/Company/Document access remains independent. The browser receives no model credentials.

The runtime needs HTTPS egress to `auth.openai.com` and `api.openai.com`. Discovery URLs, redirects, JWKS and issuer are checked; arbitrary model-provided hosts are not accepted. No API key, credit purchase or automatic paid fallback is used.

## First controlled use

1. Use a permitted fictional or anonymized representative dossier first, with an authorized source editor. Open Project → Dossier analysis and create a fresh native analysis.
2. Choose **Continue with ChatGPT**, authorize the exact application, and confirm the connected account and available model. Keep the callback popup allowed. The subscription's actual granted scopes decide whether inference is available.
3. Select Romanian or Russian and explicitly consent to sending the selected extracted passages. Start the review. The authorized browser drives one bounded batch at a time; keep the page open. Closing it preserves the checkpoint and requires deliberate resumption; it is not a detached worker service.
4. Inspect coverage, exact quotations and candidate proposals. Import separately, then confirm/reject/correct through existing attributed human review. No result establishes conformity or completeness.
5. Exercise quota pause, source change, disconnect and restart before broader use. A request interrupted after dispatch may have consumed allowance; the interface requires deliberate recovery rather than blind retry.

The current job limit is 4,096 text batches and 200 validated proposals, with a 1 MiB checkpoint cap. Native source/parser limits remain in force. The provider boundary caps each request at 180 seconds for inference (45 seconds for OAuth/catalog requests) and 512 KiB of streamed response. Oversized or invalid outputs stop the job without declaring it complete. Partial and unreadable sources remain explicit; OCR is not implemented here.

Refresh tokens rotate under a single-session lease. Disconnect clears local use before attempting remote revocation; an unconfirmed remote revocation is displayed and can be resolved in [ChatGPT connection/usage settings](https://chatgpt.com/settings/usage). No live account has been activated by the development tests.

ChatGPT account settings can permit apps to consume purchased ChatGPT credits after included usage. Disable that option and automatic credit purchases in ChatGPT if processing must stop at the included allowance. PRISMA never buys credits or uses a separate paid API-key fallback.
