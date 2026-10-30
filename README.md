# Local verification evidence — never merge into product

This parentless evidence ref is the workflow's release-upload fallback.
Evidence is self-reported local execution; no GitHub runner success is asserted.

PR: #981

Source: `5f344b40d4818c00133b301710d20284f1e421b7`

Base: `63c5388d4a57705117b0067735793b4bea2ce5a5`

Integration tree: `d83a31248c70504e040f472ee9454c0cc88f0309`

See [report](report.md), [canonical manifest](manifest.json), and [publication index](publication-index.json). Selected/sanitized copies are labelled in the index; complete originals remain in the local execution workspace.

Run `sha256sum -c SHA256SUMS` to verify the selected files and index. Keep the final proof for at least 14 days after merge; delete only its owned evidence ref when retention permits. Never merge, rebase or cherry-pick this ref into source branches.
