# Local verification evidence — never merge into product

This parentless evidence ref is the workflow's release-upload fallback.
Evidence is self-reported local execution; no GitHub runner success is asserted.

PR: #952

Source: `12924cb4fed71ada909caccb6249cd4298452589`

Base: `e356bbfe4a6dc09727f50f922363ada5931e4e26`

Integration tree: `5ade0c06e665b2adb71633165c37054ae69ffd01`

See [report](report.md), [canonical manifest](manifest.json), and [publication index](publication-index.json). Selected/sanitized copies are labelled in the index; complete originals remain in the local execution workspace.

Run `sha256sum -c SHA256SUMS` to verify the selected files and index. Keep the final proof for at least 14 days after merge; delete only its owned evidence ref when retention permits. Never merge, rebase or cherry-pick this ref into source branches.
