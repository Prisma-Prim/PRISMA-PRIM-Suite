# Controlled questionnaire preparation — fictional native proof

Issue [#1453](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1453), code `31f8ca16f327f3b5f06080d11c4fb4665af65049` on the separately authorized dossier-analysis input. These six original Playwright element captures were inspected before publication. They show Romanian desktop (1440 × 900 viewport) and Russian narrow (390 × 844 viewport); element captures may be taller than the viewport. Exact image hashes and run timing are in [proof.json](proof.json).

| Stage | Romanian desktop | Russian narrow |
| --- | --- | --- |
| Reviewed values, exact source citations and deliberate selection | [Preview](desktop-ro-preview.png) | [Preview](narrow-ru-preview.png) |
| Editable draft with a human address correction and untouched scope/counts | [Edited](desktop-ro-edited.png) | [Edited](narrow-ru-edited.png) |
| Separately submitted native application, Version 2 | [Saved](desktop-ro-saved.png) | [Saved](narrow-ru-saved.png) |

The real App/API/PostgreSQL journey passed at both widths, with no retries or skips. It asserts no native Case writes before Save, only selected replacements, preservation of manual scope and other application facts, edited native values, rejection of the old target revision and unchanged original proposals/review citations. Generic Project sources remain current when only the application changes; Case-attached source staleness is covered separately by the native REST test.

Affected local suites passed: 213 API tests and 557 Web tests; final preparation REST 4/4 and rendered guards 6/6. Current-source family gating and initial-history endpoint errors discovered by the browser were corrected before the retained pass. Two independent review axes found no code/spec findings; browser proof was pending at their review and is now supplied here.

All identities, Companies, Clients, documents, dates and addresses are fictional fixtures. Authentication and scan acceptance use existing deterministic test protocols. This is no real-corpus accuracy, live identity/scanner, deployment or account-activation claim. Only legal name, address and scope are prepared; all other questionnaire facts remain manual. Required PR CI is tracked separately. No raw diagnostic log or trace is published.
