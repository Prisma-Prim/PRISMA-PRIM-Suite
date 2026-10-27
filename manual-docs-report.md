# Manual documentation development checks

**NON-CANONICAL. No complete actual-main merge qualification is established.**

Status: passed. Source: 12a5c74fdadcb27923a222cf94d460a43442c1a2; known main: 410c49884fd369009c30028c117368c0c0c45525; delta base: aacda4a34631fbd1ddf7889b0dd3528af851f8bc; tree: b19e57c7af8c2d7428920a8f0024d886528e0f9b.

| Command | Result | Exit | Literal argv |
| --- | --- | --- | --- |
| doctor | passed | 0 | ["node","scripts/agent-doctor.mjs"] |
| format | passed | 0 | ["pnpm","format:check"] |
| lint | passed | 0 | ["pnpm","lint"] |
| types | passed | 0 | ["pnpm","typecheck"] |
| scripts | passed | 0 | ["pnpm","test:scripts"] |
| documentation | passed | 0 | ["pnpm","--filter","@prisma-prim/api","exec","vitest","run","src/demonstration"] |

Before/after tracked hashes, allowlisted configuration (database URL values omitted), versions, UTC timing and log hashes are in development-record.json.
The original full report remains bound to its old source/base/tree. These six manual checks do not override the current-base canonical-gate requirement or grant an owner exception.
