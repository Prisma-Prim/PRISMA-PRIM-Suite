# Local verification evidence — never merge into product

This parentless evidence ref is the workflow's release-upload fallback.
Evidence is self-reported local execution; no GitHub runner success is asserted.

PR: #978

Source: `fc1331d47b8290474379d24d5edd6bb213f994b8`

Base: `582e5e032961f5869b961181659a4858a63b90d9`

Integration tree: `1a3b8d758db6ae91db7e10b617cbb1f104b1499e`

See [report](report.md), [canonical manifest](manifest.json), and [publication index](publication-index.json). Selected/sanitized copies are labelled in the index; complete originals remain in the local execution workspace.

Run `sha256sum -c SHA256SUMS` to verify the selected files and index. Keep the final proof for at least 14 days after merge; delete only its owned evidence ref when retention permits. Never merge, rebase or cherry-pick this ref into source branches.
