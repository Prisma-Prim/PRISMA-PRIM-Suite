# Verification cost ledger

**Status:** Local repository rule  
**Owner:** Dan Popescu  
**Issues:** [#1278](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1278), decision in [#1275](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1275); one file per run since [#1328](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1328); subagent runs since [#1372](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1372)

Every verification run leaves one cost record, so the owner can compare what proof costs with what it catches. [Issue execution](issue-execution.md#final-report) asks for the record; `scripts/verification-cost.mjs` builds, checks and summarizes it. Its `--help` lists every option, and its `validateRecord` is the schema.

## When to record

Record each run of these types:

| Run type             | Run                                                      |
| -------------------- | -------------------------------------------------------- |
| `pull-request-proof` | the verification that proves a pull request              |
| `journey-audit`      | an exploratory journey audit                             |
| `pilot-replay`       | a private pilot replay                                   |
| `verify-journey`     | a local `pnpm verify:journey` run outside a pull request |

## The ledger

The ledger is the directory [`verification-cost/records/`](verification-cost/records/), with one file per run: `<run id>.json`, where a `:` of the run identifier becomes `~` because Windows refuses it in a file name. The same pull request adds the file, or the audit report's pull request does. A new run only ever adds a new file, so pull requests open at the same time never conflict on their cost records. Name the run with `--run-id` when the session holds several runs, and narrow the source with `--from` and `--to`.

## Building the record

The harness's own usage data comes first. `record` prints the record on one line; `--append` also writes it as its new file in the ledger, and refuses a run identifier already there. Build it once the pull request exists, so the record carries its number. Commit the new file with the pull request.

- **Claude Code, local** (`--harness claude-code-local`): pass the session transcript and its folder, which holds the subagent transcripts. Both sit in `~/.claude/projects/<project folder>/`, named after the session identifier.

  ```text
  node scripts/verification-cost.mjs record --run-type pull-request-proof --harness claude-code-local \
    --issue 1278 --pull-request 1300 --claude-code <session>.jsonl --claude-code <session>/ \
    --result pass --findings P2=1 --append
  ```

  A subagent records only its own run. It passes only its transcript, the newest `<session>/subagents/agent-<agent id>.jsonl` that mentions its worktree, and no `--run-id`: the run is then `<session>:<agent id>`, in the file `<session>~<agent id>.json`. The session's transcript or folder would add the parent's tokens. A subagent that finds no such transcript records nothing and says so in its report.

- **Codex, local** (`--harness codex-local`): pass the rollout, `~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-*.jsonl`. Decompress a `.zst` rollout first.
- **Codex Cloud or CI** (`codex-cloud`, `ci`): no local trace exists. The session gives the figures it can report itself with `--model`, `--input`, `--output`, `--cache-creation`, `--cache-read`, `--start` and `--end` or `--duration-seconds`.

A figure the source does not give is written as `not reported`; the script never guesses it. It refuses an unknown run type or harness, and a source the harness cannot leave.

`--findings` counts the defects the run caught by severity, `P0` to `P3`, or `none`. `--notes` takes one line of at most 500 characters.

## What the figures mean

- **Tokens.** From Claude Code, the usage of each model response; streamed parts of one response count once. From Codex, the increase of the cumulative token counts, given to the model of the turn that produced it. Codex counts cached input inside input; the record splits it out, so `input` means uncached input in both.
- **Time.** First and last entry of the source inside the window, and the wall-clock duration between them.
- **Price.** An estimate in the sense of [measurement evidence](measurement-evidence.md#what-the-figure-is), from the list price per token in a [price table](verification-cost/price-tables/) at standard speed. It is not the bill. A subscription, web search fees, fast mode and other tiers fall outside it. A model or usage the table cannot price leaves the price `not reported`.

Claude Code also keeps a running session cost. On long or resumed sessions it can differ from the transcript in either direction; the record keeps the transcript figures.

## Price tables

A table is a JSON file named after its version, the date its prices were read. A price change adds a new file; a table that a record names is never edited or deleted. Each record stores its estimate and table version, and the summary adds recorded estimates without pricing again. A model whose price could not be verified keeps `null` prices and a note.

## Checking and analysing

The script tests run `check`, so CI fails on a malformed record, a file not named after its run identifier, two file names that differ only in case, a leftover `ledger.jsonl`, or a price table that is missing or invalid.

```text
node scripts/verification-cost.mjs summary [--json]
```

The summary prints, by run type, harness, model and month: runs, duration, each token category, estimated price and findings, as totals and averages, and the cost per finding. Prices add up as whole micro-dollars, so the figures do not depend on the order of the files.

## Moving a branch's `ledger.jsonl`

Until #1328 the ledger was the single file `verification-cost/ledger.jsonl`, and every pull request appended its line to it. A branch begun before then still appends there, and merging `main` into it reports a conflict on that file. Keep the branch's version of the file, then run:

```text
node scripts/verification-cost.mjs migrate
```

It writes each line as its record file, skips a record already present unchanged, refuses a line that differs from the record present and then writes nothing, and deletes `ledger.jsonl`. Commit the result; `check` passes again.

## Privacy

Records hold numbers and identifiers only. They never hold prompt or response text, file contents or real Client names. The script reads usage counts, model names, timestamps and session identifiers from transcripts and keeps nothing else. Transcripts stay outside Git.
