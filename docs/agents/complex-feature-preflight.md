# Complex-feature preflight

Use this pre-code check only when a missing product contract could create late review cycles. Classify the semantic change, not the file type: a Markdown edit that changes product behavior is a product-contract change.

## Pull-request classification

Every PR declares exactly three fields:

- **Class:** `mechanical`, `product-contract`, or `implementation`;
- **Product contract changed:** `yes` or `no`;
- **Preflight:** `exempt-low-risk`, `required`, or `linked path/to/preflight.md`.

Add evidence only when it applies:

- **Exemption reason:** required for `exempt-low-risk`;
- **High-risk boundaries:** required when one or more boundaries apply; absence means none;
- **Normative owner:** required when the product contract changed;
- **Pre-code Spec review:** `approved`, required when the product contract changed or a full preflight is used.

Do not add `not-applicable` placeholders. A mechanical PR must declare no product-contract change and use `exempt-low-risk`. A product-contract PR must declare a product-contract change. Any high-risk boundary requires a full preflight.

## High-risk boundaries

Use the canonical values `authentication`, `authorization`, `permissions`, `workspace-isolation`, `migration`, `activity-log`, `privacy`, `async-identity`, `concurrency`, and `transversal`.

A full preflight is required when one of those boundaries applies. An isolated low-risk change is exempt. A narrow product-contract clarification may be exempt only when it has no high-risk boundary and receives Spec approval before code.

## Exact issue markers

Every issue closed by a PR contains exactly one disposition marker:

```markdown
<!-- complex-feature-preflight: required -->
<!-- complex-feature-preflight: exempt-low-risk -->
<!-- complex-feature-preflight: linked docs/path/to/authoritative-preflight.md -->
```

Keep only the applicable line. An exemption also contains a concrete line in this exact form:

```markdown
- Exemption reason: isolated documentation correction with no product-contract change.
```

A required or linked preflight, and every product-contract change, records approval with exactly one marker in the authoritative issue or linked note:

```markdown
<!-- pre-code-spec-review: approved -->
```

The validator reads only these machine markers and named fields outside code examples. It does not interpret review headings, `PASS` prose, or legacy approval sentences. A linked path is case-sensitive and repository-relative; its canonical target must stay inside the repository, including through symlinks.

For local drafting, run:

```text
node scripts/validate-complex-feature-preflight.mjs --advisory path/to/issue-or-brief.md
```

Pull-request governance runs the same checks in blocking mode against the closing issue.

## Required matrix

For `required` or `linked`, use the [execution-note template](complex-feature-preflight-template.md) and complete these seven sections before implementation:

1. **States and transitions**
2. **Actors and identities**
3. **Mutation contract**
4. **Data authority**
5. **Surfaces**
6. **Test matrix**
7. **Exclusions and unresolved decisions**

The Spec reviewer decides whether the content is sufficient and adds the exact approval marker. Automation verifies structure and recorded disposition, not architectural quality.

## Review-cycle stop rule

Complete formatting, Standards review, and Spec review against the full diff before the first publication. After terminal feedback, collect all material findings and publish one grouped correction. If a second material product-contract wave appears, stop editing and return the issue to preflight.

After five merged PRs, use GitHub timelines and a short retrospective to compare late corrections, false-positive failures, and mechanical-PR completion time. Keep this gate only if it reduces rework without slowing the simple path; otherwise simplify or remove it.
