# Local verification evidence — never merge into product

This parentless evidence ref is the workflow's release-upload fallback.
Evidence is self-reported local execution; no GitHub runner success is asserted.

PR: #982

Source: `5e7319d8392efe6fa8404617ed6dc9b1d392ccdd`

Base: `709d8c3aee300c4124cc202a1f8fcaed6a894393`

Integration tree: `a2b1d0b4fd8e94cbbe574d35ae1bc8f12d0cd107`

See [report](report.md), [canonical manifest](manifest.json), and [publication index](publication-index.json). Selected/sanitized copies are labelled in the index; complete originals remain in the local execution workspace.

Run `sha256sum -c SHA256SUMS` to verify the selected files and index. Keep the final proof for at least 14 days after merge; delete only its owned evidence ref when retention permits. Never merge, rebase or cherry-pick this ref into source branches.
