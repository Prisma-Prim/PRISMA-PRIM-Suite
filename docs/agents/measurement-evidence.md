# Measurement evidence

**Status:** Local repository rule  
**Owner:** Dan Popescu  
**Issue:** [#1219](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1219)

[Delivery proof](delivery-proof.md#a-reported-number) sends every reported figure here. Quoted upstream sentences stay labeled. The comparators below stay the calculators. This file does not add a platform or a model judge.

## Source that was checked

`cursor/plugins` revision `6b0300214a09fd6029cfb7077043125758cd1fd2`, [Explain the Number](https://github.com/cursor/plugins/blob/6b0300214a09fd6029cfb7077043125758cd1fd2/pstack/skills/principle-explain-the-number/SKILL.md):

> Keep the evidence with the number. Put the run count, the spread, and the limiter in the notes or a linked artifact.

> A guess from reading the code is not a limiter.

## What the figure is

Name one of these four labels next to the figure:

- **Actual measurement.** The command ran against the work being measured. The note names the command, the revision, the inputs and parameters, and an artifact that holds the output and the exit status. For a speed or throughput figure, also name the run count, the spread, and the limiter taken from a profile or counters during the run.
- **Result on prepared examples.** The inputs are fixtures written for the check. Say so. A passing fixture result is not validation of the system.
- **Unverified declared data.** The inputs are declarations the command did not measure itself. The pilot and knowledge receipts use `measurementBasis` `declared_inputs_unverified` for this label.
- **Estimate.** The figure was not produced by a command in this run. Say estimate. An estimate is not an actual measurement.

A failed, interrupted, or partial run stays in the evidence with its status. It is not a complete result.

## Comparators

Reuse the commands that already exist:

- `node scripts/pilot-evaluation.mjs` compares paired pilot observations and writes `result.json` and `report.md`.
- `node scripts/knowledge-qualification.mjs` prepares or evaluates a knowledge bundle and writes the same two entries.

Read the receipt's `dataKind` and `measurementBasis`, and the report heading. The pilot report states its limit in the command's own words: timings, references, and hashes are supplied declarations, and the command performs no independent measurement, source-byte authenticity check, or semantic-support verification. Exit 0, including a complete report, is no pilot quality verdict. The knowledge report says failed, not-run, and absent observations contribute no measurements, and that source text and authored qualitative properties require separate human assessment. Those conclusions stay with a person. No model call judges a figure.

## Which run

A routine change runs the targeted check the issue names, or the existing test for the module it touches: `node --test scripts/pilot-evaluation.test.mjs` or `node --test scripts/knowledge-qualification.test.mjs`. A routine change does not start a full campaign.

Run the comparator and keep its receipt when the change alters that comparator or when a figure from it will be published. A full campaign, both comparators on a set large enough to support the decision, is for a significant change to a published result.

## Worked example

This figure is a result on prepared examples and unverified declared data. It is not an actual measurement and not validation of the system.

Command:

```text
node scripts/pilot-evaluation.mjs --cases scripts/fixtures/pilot-evaluation/one.cases.json --runs scripts/fixtures/pilot-evaluation/one.runs.json --output /tmp/pilot-one-result.tar
```

Revision: `ce738e1a61496894dd65b26e4a31236b40642164`

Inputs: `scripts/fixtures/pilot-evaluation/one.cases.json` and `scripts/fixtures/pilot-evaluation/one.runs.json`. The case set is `DEMO-ONE`, `dataKind` synthetic, one case `A`. The runs declare manual elapsed `60000` ms and assisted elapsed `30000` ms.

Execution status: exit 0.

Receipt, the stdout of that command:

```text
{"schema":"prisma-prim-pilot-receipt/v2","dataKind":"synthetic","measurementBasis":"declared_inputs_unverified","format":"ustar","entries":["result.json","report.md"]}
```

Retained report line:

```text
Time: 60000 → 30000 ms; reduction 50.000000%.
```

The 50% reduction is the comparator's arithmetic on those declared times. The report heading is `SYNTHETIC — mechanics demonstration`.
