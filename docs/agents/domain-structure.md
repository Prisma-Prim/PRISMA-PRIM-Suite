# Domain structure

**Status:** Local repository rule  
**Owner:** Dan Popescu  
**Adopting issue:** [#1224](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1224)

This file is the active rule. The three upstream texts it links are references. They stay byte-identical to the pinned sources, and this file does not rewrite them.

Before writing logic:

1. Derive types from real caller usage.
2. Trace access patterns.
3. Choose structures that match the dominant paths.

## Upstream references

Pinned to `cursor/plugins` revision `6b0300214a09fd6029cfb7077043125758cd1fd2`.

- [Model the Domain](pstack-references/principle-model-the-domain.md) is a principle skill.
- [Boundary Discipline](pstack-references/principle-boundary-discipline.md) is a principle skill.
- [Architect](pstack-references/architect.md) is a procedure and skill source adopted as documentation. It is not an official principle.

Each linked file quotes one complete upstream `SKILL.md`, including its frontmatter, inside a `text` fence. The SHA-256 in that file is the hash of the upstream bytes.

## Local application of Boundary Discipline

The upstream fence keeps this sentence unchanged: "Inside the system: typed data, error propagation, no re-validation. Trust the types."

That sentence governs repeated validation of data whose type is already established. Recheck authorization, versions, and mutable state inside the transaction that relies on them. A boundary parse establishes the shape of input. It leaves a grant, an expected version, and other mutable facts free to change until that transaction rechecks them. The authorization rules in `AGENTS.md` stay in force, including the existing access checks.

## Helpers the architect source names

`architect/SKILL.md` does not contain the helper corpus. This repository cites the helpers that source names and copies none of them. The relative Markdown link inside the exact quote, `references/design-red-flags.md`, resolves through the pinned URL below.

- [`architect/references/design-red-flags.md`](https://github.com/cursor/plugins/blob/6b0300214a09fd6029cfb7077043125758cd1fd2/pstack/skills/architect/references/design-red-flags.md) is the only Markdown link in the architect source.
- [`architect/references/rationale-template.md`](https://github.com/cursor/plugins/blob/6b0300214a09fd6029cfb7077043125758cd1fd2/pstack/skills/architect/references/rationale-template.md) is named in Outputs.
- [`architect/references/runner-prompt.md`](https://github.com/cursor/plugins/blob/6b0300214a09fd6029cfb7077043125758cd1fd2/pstack/skills/architect/references/runner-prompt.md) is named in Phase B.
- [`how/SKILL.md`](https://github.com/cursor/plugins/blob/6b0300214a09fd6029cfb7077043125758cd1fd2/pstack/skills/how/SKILL.md) is named in Phase A and Phase E.
- [`why/SKILL.md`](https://github.com/cursor/plugins/blob/6b0300214a09fd6029cfb7077043125758cd1fd2/pstack/skills/why/SKILL.md) is named in Phase A.
- [`arena/SKILL.md`](https://github.com/cursor/plugins/blob/6b0300214a09fd6029cfb7077043125758cd1fd2/pstack/skills/arena/SKILL.md) is named in Phase B and Phase E.
- [`principle-exhaust-the-design-space/SKILL.md`](https://github.com/cursor/plugins/blob/6b0300214a09fd6029cfb7077043125758cd1fd2/pstack/skills/principle-exhaust-the-design-space/SKILL.md) is named in Phase B.
- [`principle-foundational-thinking/SKILL.md`](https://github.com/cursor/plugins/blob/6b0300214a09fd6029cfb7077043125758cd1fd2/pstack/skills/principle-foundational-thinking/SKILL.md) is named in Phase C.
- [`principle-outcome-oriented-execution/SKILL.md`](https://github.com/cursor/plugins/blob/6b0300214a09fd6029cfb7077043125758cd1fd2/pstack/skills/principle-outcome-oriented-execution/SKILL.md) is named in Phase C.
- [`interrogate/SKILL.md`](https://github.com/cursor/plugins/blob/6b0300214a09fd6029cfb7077043125758cd1fd2/pstack/skills/interrogate/SKILL.md) is named in Phase C.
- [`principle-redesign-from-first-principles/SKILL.md`](https://github.com/cursor/plugins/blob/6b0300214a09fd6029cfb7077043125758cd1fd2/pstack/skills/principle-redesign-from-first-principles/SKILL.md) is named in Phase E.
- [`principle-fix-root-causes/SKILL.md`](https://github.com/cursor/plugins/blob/6b0300214a09fd6029cfb7077043125758cd1fd2/pstack/skills/principle-fix-root-causes/SKILL.md) is named in Phase E.
- [`principle-subtract-before-you-add/SKILL.md`](https://github.com/cursor/plugins/blob/6b0300214a09fd6029cfb7077043125758cd1fd2/pstack/skills/principle-subtract-before-you-add/SKILL.md) is named in Phase E.

The architect source also names `pstack-models.mdc`. Fetches of `pstack/pstack-models.mdc`, `pstack/skills/pstack-models.mdc`, `pstack/skills/architect/pstack-models.mdc`, `pstack/skills/architect/references/pstack-models.mdc`, `pstack/rules/pstack-models.mdc`, and `.cursor/rules/pstack-models.mdc` at this revision returned 404. This repository records no URL for that file.

## License

The upstream texts are copied under the MIT License.

```text
MIT License

Copyright (c) 2026 Lauren Tan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The license text above is the `pstack/LICENSE` file retrieved from the same revision: https://github.com/cursor/plugins/blob/6b0300214a09fd6029cfb7077043125758cd1fd2/pstack/LICENSE
