# Offline dossier volume qualification

This tool measures the existing native parser and deterministic one-source analysis engine from [the pinned #1435 input](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/commit/e48a4b430e712be124a6e2d9e6d0fe9ac48fcd95). It writes no business data and calls no provider. Its authority is the Dossier Analysis PRD §§3, 13, 16 and Processing Efficiency PRD §§7–10. This is prepared qualification for #1445; the owner-started real-corpus pilot #1279 remains open and unqualified.

From the repository root, with the frozen dependencies installed:

```sh
pnpm --filter @prisma-prim/api qualify:dossier-volume --prepared small --concurrency 1
```

The command builds the API and runs the compiled tool. After that build, use `node apps/api/dist/dossier-volume-qualification/main.js --help` or call that file directly to keep build cost outside measurements. Select `small`, `medium` or `large`, concurrency `1` or `2`, and optionally `--stop-after N`. Each invocation writes exactly one sanitized JSON summary to stdout. Use a new private output directory for each matrix; keep every result, including failures.

## Prepared corpus and results

Six independently labelled fictional shapes cover mixed Cyrillic/Romanian diacritics, column-painted spatial PDF tables, native text with a raster-only page, image-only PDF, bilingual Word fields, merged Word cells and nested Word tables. Labels are literal passages, candidate values and coverage states in `fixtures.ts`, never derived from successful extraction. The image-only placeholder tests unsupported image coverage; it contains no readable scan text and measures no OCR accuracy. PDF metadata and ZIP timestamps are fixed; repeat generation produces identical hashes. DOCX has structural units, never invented page numbers.

[Measured results](prepared-2026-11-18.json) retain versions, source-input hashes, machine facts, fixture hashes, all pre-review and instrumented matrix observations, cancellation and malformed-private outcomes. They also retain the earlier exploratory wall times whose detailed outputs were overwritten before the final matrix. Those earlier resource observations are unavailable. The reviewed matrix adds exact commands, process exits, one-run min/max spans and measured extraction/analysis duration counters. Earlier timing-only observations lack those stage counters and cannot support a speed/throughput conclusion. No fastest-run selection is made.

| Prepared batch | Sources | PDF pages | Source bytes | c1 wall ms | c2 wall ms | c1/c2 sampled peak RSS MiB |
| -------------- | ------: | --------: | -----------: | ---------: | ---------: | -------------------------: |
| Small          |       6 |         4 |       20,252 |        932 |        875 |              185.6 / 211.3 |
| Medium         |      24 |        16 |       81,008 |      3,050 |      1,681 |              191.1 / 260.0 |
| Large          |      60 |        40 |      202,520 |      7,098 |      3,916 |              218.9 / 268.4 |

These are actual measurements on prepared examples, one fully instrumented invocation per setting, rounded here; exact values and UTC instants are in JSON. The base set recovers 8/8 independently expected passages, 9/9 candidates and 6/6 coverage states, with zero false positive or false negative literals. Medium/large denominators multiply by four/ten. All per-source native result hashes agree across concurrency settings and the restart. Each repetition retains three partial and one unreadable source. The large batch therefore contains 30 partial and 10 unreadable sources; a successful qualification exit does not make those sources complete.

The same six small files are repeated; this is a bounded scheduling and repeatability exercise. It does not represent a large private dossier, dense tables, long PDFs or maximum-size inputs. The measurements include parser worker startup and one-source analysis, and exclude fixture generation, API build, upload/scanning, PostgreSQL persistence, access control and cross-source comparisons. There is no workload SLA or production worker recommendation. RSS samples cover the whole process including worker threads every 10 ms; short peaks can be missed. `processHighWaterRssBytes` is the process high-water observation and includes prior work in that invocation. The stage counters locate approximately 99.0–99.7% of summed per-source extraction/analysis duration in native extraction, including its worker startup and wait. This is the observed dominant stage occupying the bounded scheduler slots; it does not establish a CPU, I/O or startup bottleneck. Concurrent durations overlap. With one instrumented invocation per setting, min equals max and variance is not estimable. Other machine activity was uncontrolled.

## Stop and restart

`--stop-after 1 --concurrency 2` stops admission after the first completion, then drains already admitted native work. The recorded small run completed two sources and left four non-admitted, with `status: interrupted` and exit 3. An actual SIGINT also produced an interrupted summary. SIGINT/SIGTERM are handled during input preparation as well as extraction; no new source starts after the signal is observed. In-flight extraction retains its existing 20-second deadline. An interrupted run is never complete even if its admitted work finishes. A restart is a fresh invocation over the original immutable bytes; it does not silently resume a cancelled result.

Existing per-source limits remain: 5 MiB source bytes, 20-second extraction deadline, 256 MiB worker old generation, existing PDF-page/XML/archive/text and engine candidate limits. Qualification admits at most 200 sources and private input totals at most 64 MiB, with at most two native workers. This tool changes no production limit or approval boundary.

## Private local replay

The owner must supply authorized local originals, independently reviewed literal labels if quality is to be measured, and a machine with the pinned software. Keep the entire corpus and output off Git and public services. Use a flat, non-symlink directory with `manifest.json`:

```json
{
  "version": "dossier-volume-input/v1",
  "files": [
    {
      "path": "local-original.docx",
      "kind": "docx",
      "language": "ro",
      "sha256": "REPLACE_WITH_64_LOWERCASE_HEX_CHARACTERS"
    }
  ]
}
```

Then run `node apps/api/dist/dossier-volume-qualification/main.js --corpus /private/local-directory --concurrency 1` on that machine. Never paste that command's real path into an issue or PR. Each entry may additionally contain `expected: { state, passages, candidates }`, where passages are exact strings and candidates are strings such as `taxId:00042`. Without independent labels, quality is `null`; parse success is not correctness. Source SHA-256, supported extension, language, bounded sizes and strict manifest keys are checked; traversal, duplicate entries, symlinks, named pipes and other special files, hash mismatches and malformed manifests are refused. Descriptor opening is nonblocking and followed by a regular-file check; actual compiled-CLI FIFO probes return safe invalid-input JSON with exit 2.

Private summaries contain ordinal numbers, byte/unit counts, bounded outcome codes, timing/resource measurements and optional aggregate label metrics. They omit source names, paths, text, candidate values, locators and source/result fingerprints. Parser diagnostics stay inside a captured worker, including malformed-PDF warnings. Export only the summary after inspection. The committed synthetic malformed-private replay demonstrated one failed extraction with no source name, source text, path, fingerprint or raw diagnostic in stdout/stderr. This is a privacy-boundary test, not a real private pilot.

Exit codes: `0` completed with matching supplied labels; `1` failed extraction or label mismatch; `2` malformed input; `3` interrupted. Partial/unreadable sources remain explicit, and absence of labels remains unknown quality. A summary cannot release Certification decisions or turn proposals into confirmed business facts.
