# Offline RU/RO OCR comparison

Neither tested configuration is ready to supply unattended audit facts. Both recover only 10 of the 20 independently labelled critical values across these ten prepared pages per repetition. Rotated/noisy pages and Russian table cells fail visibly. `best` improves some literal text and Romanian cells, but that is a reason to retain it for the next private evaluation, not to activate production OCR.

This is #1446's separate local inference/evaluation worker. It changes no application extraction, Certification authority or source facts. Authorities: [Dossier Analysis PRD on the pinned #1435 input](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/e48a4b430e712be124a6e2d9e6d0fe9ac48fcd95/docs/product/dossier-analysis-prd.md), deferred OCR boundary #1434 and the Processing Efficiency PRD. No main merge, provider, paid API, document upload, subscription or deployment is authorized.

## Configurations and provenance

These are two configurations of the **same Tesseract 5.5.0 LSTM engine**, using identical `--oem 1 --psm 6`, one process and `OMP_THREAD_LIMIT=1`. They are not two independent OCR architectures. Exact model commits and four SHA-256 values are owned by [`models.json`](../../../tools/ocr-benchmark/models.json); the runner verifies every selected weight before inference. Binary SHA-256, runtime versions and exact fixture/model identities are retained in the measured evidence.

- [Tesseract 5.5.0 licence](https://github.com/tesseract-ocr/tesseract/blob/5.5.0/LICENSE): Apache-2.0.
- [tessdata_fast README](https://github.com/tesseract-ocr/tessdata_fast/blob/87416418657359cb625c412a48b6e1d6d41c29bd/README.md) describes integer LSTM models, their speed/accuracy compromise and the required LSTM engine; [licence](https://github.com/tesseract-ocr/tessdata_fast/blob/87416418657359cb625c412a48b6e1d6d41c29bd/LICENSE): Apache-2.0.
- [tessdata_best README](https://github.com/tesseract-ocr/tessdata_best/blob/e12c65a915945e4c28e237a9b52bc4a8f39a0cec/README.md) identifies its trained LSTM models; [licence](https://github.com/tesseract-ocr/tessdata_best/blob/e12c65a915945e4c28e237a9b52bc4a8f39a0cec/LICENSE): Apache-2.0. The upstream name is not an empirical accuracy verdict for these audit examples.

The four downloaded files total 31,135,580 bytes. No weight is committed. Use the official URLs at those exact commits, stored as `MODEL_DIRECTORY/fast/{ron,rus}.traineddata` and `MODEL_DIRECTORY/best/{ron,rus}.traineddata`. For example:

```sh
curl -fL https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd/ron.traineddata -o MODEL_DIRECTORY/fast/ron.traineddata
```

Repeat for `rus`, and for `tessdata_best` at its pinned commit into `best`. Create those local directories first. This uses existing Tesseract and ordinary official model files; the tool installs nothing and performs no network requests. Python 3.12 and Pillow 12.3.0 were used. [`requirements.txt`](../../../tools/ocr-benchmark/requirements.txt) pins Pillow; the bundled DejaVu Sans font and [its licence](../../../apps/api/src/commercial-pdf/assets/font-license.txt) remain the source of raster text.

## Reproduce and inspect

Use Linux with Tesseract 5.5.0 on `PATH` and the selected pinned weights locally. From the repository root:

```sh
python3 -m unittest discover -s tools/ocr-benchmark -p 'test_*.py'
python3 tools/ocr-benchmark/benchmark.py generate --output NEW_LOCAL_FIXTURE_DIRECTORY
python3 tools/ocr-benchmark/benchmark.py run --fixtures NEW_LOCAL_FIXTURE_DIRECTORY --models MODEL_DIRECTORY --output NEW_LOCAL_RESULT_DIRECTORY --repeat 2
python3 tools/ocr-benchmark/preview.py --fixtures NEW_LOCAL_FIXTURE_DIRECTORY --report NEW_LOCAL_RESULT_DIRECTORY/report.json --output NEW_LOCAL_PREVIEW_DIRECTORY
```

Every output directory must be new; reruns cannot overwrite an earlier result. `--engines fast`, `--engines best` or `--engines fast,best` selects configurations. `--cases ro-clean,ru-grid-merged` selects exact fixture IDs; duplicate or unknown selections fail. `--repeat` is 1 or 2, default 2. Run 2 reverses configuration order. `--help` describes each command. Standard-library metric/input tests are also registered in the existing Node script suite, requiring no models or Pillow in CI.

The ten generated PNG pages have independent literal text, critical values and cell rectangles in their manifest before inference: Romanian accents, Russian Cyrillic, leading-zero identifiers and dates, a ruled table with one title spanning both columns, 90° rotation, deterministic low-resolution noise, a fictional stamp and diagram text. Image/manifest hashes fix exact work. Source text and cell geometry are never inferred from OCR output. Diagram relationships, stamp authenticity and semantic reconstruction of merged cells remain unsupported. The table metric evaluates text in already labelled regions; it does not measure table detection or reconstruction.

The preview overlays observed OCR word boxes in red and independent cells in green, then prints the recognized text and literal denominators. The contact sheet of all 20 configuration/case previews and the full Romanian clean/Russian table previews were inspected. The source Russian table is readable while OCR omits its field labels and corrupts its numbers. Published preview links and the reviewed raw-result archive are recorded on the PR; no binary evidence enters product history.

## Results and interpretation

[`prepared-2026-11-18.json`](prepared-2026-11-18.json) retains all four complete two-repetition matrices: 160 actual inferences, no process failures or unexecuted cases. Every inaccurate/unsupported result remains present. Inference completion is separate from literal correctness. An initial hand invocation produced no TSV because an isolated model directory lacked the system `tsv` config; that attempt is explicitly nonqualifying. The corrected explicit `tessedit_create_tsv` invocation matches the runner's first Romanian result exactly.

| Configuration / language | Character edits / expected chars, each repeat | Critical values / expected | Exact labelled cells / expected | Reviewed five-page wall seconds, min–max over 2 runs |
| ------------------------ | --------------------------------------------: | -------------------------: | ------------------------------: | ---------------------------------------------------: |
| fast / RO                |                                     225 / 649 |                     6 / 10 |                           4 / 5 |                                          1.125–1.166 |
| fast / RU                |                                     282 / 623 |                     4 / 10 |                           1 / 5 |                                          0.777–0.830 |
| best / RO                |                                     195 / 649 |                     6 / 10 |                           5 / 5 |                                          1.444–1.598 |
| best / RU                |                                     278 / 623 |                     4 / 10 |                           1 / 5 |                                          1.411–1.452 |

These are results on prepared examples with actual inference timing/resource observations. The table uses the reviewed pre-correction matrix; all four matrices are retained separately. The final corrected matrix binds the final source hashes. Correcting numeric-continuation handling changes none of these prepared quality counts. Per-case numerators/denominators, process exits, UTC instants, source/model/runtime hashes, CPU seconds, sampled RSS and both run times are in JSON. One native single-thread process is the configured execution limit; measured child CPU closely follows its wall time. No hardware bottleneck, throughput saving or workload SLA is established. Model verification reads the weights before inference; OS cache and other machine activity were uncontrolled. This is not production cold-start measurement.

Character error rate is Levenshtein insertions + substitutions + deletions divided by independently expected characters after NFC and whitespace normalization. Case, leading zeroes, dates and diacritics remain significant. Cedilla/comma substitutions count as errors. CER may exceed 1 on rotated gibberish and is not clipped. Critical-value recall counts whole literal occurrences once, not substrings or reused matches; it does not measure the precision of invented numeric values. Cell accuracy uses OCR word centres in independent nonoverlapping rectangles and exact normalized cell text; a swapped value fails alignment even if the word bag matches. Zero denominators stay `null`. Worked tests independently verify these rules, malformed/nonfinite/out-of-page TSV, invalid manifests/hashes/selections, overlapping cells and special-file rejection. An actual excessive-dimension PNG header was retained as one failed case without starting inference. Independent review also reproduced a corrupt IDAT CRC that lost the report, and a numeric substring that earned false credit. Both regressions failed before correction and pass afterward. The rerunnable native failure probe now retains one failed PNG and the other successful page, and unavailable models retain two failed rows. Fourteen stdlib tests include real child-process kill/reap checks for deadline and interruption.

The examples are small fictional variants of one font and layout, not independent samples of the document population. No confidence interval or production accuracy threshold follows. Before any private replay, its owner must authorize the local corpus and labels, supply representative independently transcribed RO/RU scans with identifiers/table regions, define acceptable critical-value/citation errors, and keep originals/results local. The current report and preview formats contain source and recognized text; they are suitable for fictional publication only. A real private replay requires an inspected aggregate export boundary before anything leaves that machine. No actual private corpus, proprietary comparison or human-review time-saving study occurred.

Recommendation: retain both pinned configurations as inexpensive baselines, with `best` as the candidate for a separately specified orientation/table-preprocessing and private-corpus experiment. Neither result authorizes production integration, automatic fact confirmation, inferred diagram meaning or parity with leading proprietary systems. Existing deterministic native extraction and human review remain unchanged.

## Local cost and failure limits

At most 20 labelled images, two configurations and two repetitions are admitted: 80 calls maximum, serial, inside a 180-second inference deadline. Each call has at most 20 wall seconds, one thread, 1 GiB child address space, 20 CPU seconds and 8 MiB output files. Sources are at most 5 MiB and 8 million pixels, manifests 128 KiB, weights 32 MiB each, metrics 4,000 normalized characters. Selected files must be regular, nonsymlink, nonblocking-open inputs; excessive dimensions and malformed output fail safely. RSS is sampled from the child every 20 ms and may miss short peaks. A missing/invalid configuration becomes failed rows while available configurations continue. Deadline/interruption leaves timeout/interrupted/not-run rows and a partial report. Exit 0 means all inference calls completed; 1 means partial/failed execution; 2 means invalid arguments/input/environment. Literal errors never disappear merely because exit 0 was returned.

No training, GPU, paid API or recurring job is introduced. The measured weights occupy about 31 MB; generated fictional images and inspected previews remain local publication artifacts. Run on an existing local machine; stop rather than provisioning a service or expanding these budgets.

Rerun the actual codec/configuration regressions with `python3 tools/ocr-benchmark/check_native_failures.py --fixtures LOCAL_FICTIONAL_FIXTURE_DIRECTORY --models MODEL_DIRECTORY`. It uses a temporary copy, corrupts only a PNG checksum, and checks partial results through the compiled native OCR boundary; originals remain unchanged.

## Different-architecture and table-structure follow-through

[#1455](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1455) adds a separately measured [EasyOCR CPU and automatic ruled-table reconstruction comparison](structure.md). This original same-engine baseline and its retained results remain unchanged.
