# Vendored Matt Pocock skills

Source: [mattpocock/skills](https://github.com/mattpocock/skills) at commit `4ae2317ddb` (2026-10-31).

Copied unchanged from `skills/engineering/`: every engineering skill. Copied from `skills/productivity/` because engineering skills call them: `grilling`, `writing-for-agents`.

The other folders here (`deslop`, `thermo-nuclear-code-quality-review`, `thermo-nuclear-review`, `thermos`, `verify`) are not from this source.

## Local adaptations to reapply on every update

1. Glossary name: this repository keeps `CONTEXT.md`, `CONTEXT-MAP.md` and `CONTEXT-FORMAT.md` where upstream says `GLOSSARY`. In `setup-matt-pocock-skills/SKILL.md`, the legacy-rename instruction is replaced by "keep the `CONTEXT` names".
2. `tdd/SKILL.md`: the seam paragraph says "Use the agreed public seam" and the refactor rule says "Refactor after green within the assigned scope" (from #793), replacing upstream's user-confirmed seams and review-only refactoring.
3. `implement-spec/SKILL.md`: a "Repository adaptation" paragraph keeps one pull request per issue instead of one combined integration pull request.

To update: replace each upstream folder with the new upstream copy, reapply these adaptations, and update the commit above.
