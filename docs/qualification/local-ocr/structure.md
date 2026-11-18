# Second OCR architecture and automatic table structure

EasyOCR improves literal recovery on these prepared Russian/Romanian examples, while retaining errors that require a human reader. This is an offline qualification worker for [#1455](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1455), under #1452. It changes no application extraction, source authority or official facts. No paid service, private document, main merge or deployment was used.

## What is compared

The existing [Tesseract comparison](README.md) remains intact. The added configuration executes EasyOCR 1.7.2 with CRAFT detection and generation-2 Cyrillic/Latin CRNN recognition on CPU. It is a different architecture from Tesseract's LSTM recognition. Romanian uses `ro,en`; Russian uses `ru,en`. English is a required compatible alphabet companion, not an additional evaluation target.

Primary sources at EasyOCR commit `c4f3cd7225efd4f85451bd8b4a7646ae9a092420`:

- [README](https://github.com/JaidedAI/EasyOCR/blob/c4f3cd7225efd4f85451bd8b4a7646ae9a092420/README.md) documents CPU mode, one-time model loading, CRAFT and CRNN/CTC recognition, and official model downloads.
- [Licence](https://github.com/JaidedAI/EasyOCR/blob/c4f3cd7225efd4f85451bd8b4a7646ae9a092420/LICENSE) is Apache-2.0.
- [Model configuration](https://github.com/JaidedAI/EasyOCR/blob/c4f3cd7225efd4f85451bd8b4a7646ae9a092420/easyocr/config.py) identifies the official release archives and upstream model checksums.

The three official weights total 113,814,994 bytes. Their release URLs, verified SHA-256 values and pinned package versions are in [models.json](../../../tools/ocr-benchmark/models.json). No weights are committed. Runtime: Python 3.12, EasyOCR 1.7.2, torch 2.9.1+cpu, torchvision 0.24.1+cpu, OpenCV headless 5.1.0.95 and the existing Pillow 12.3.0. Runtime packages and inference run locally without a subscription or per-page API fee; existing hardware and electricity still have costs.

## Detection and alignment

The generated ten-page corpus retains the earlier literal labels and pixels: clean Russian/Romanian text, leading-zero identifiers/dates, noisy low-resolution scans, 90-degree pages, two ruled tables with a spanning title, and fictional stamp/diagram text. `structure-labels.json` independently labels every expected table, row, column, span and cell before inference. Negative pages have no expected table.

The worker receives pixels and a language only. OpenCV detects long horizontal/vertical rules and connected candidate grids. A deterministic grid reconstruction joins adjacent tiles when an internal separator is absent; it rejects unsupported nonrectangular merges. A first-row spanning cell is a structural header proposal, not an interpretation of business meaning. OCR regions are assigned by geometry to the automatically proposed cells; no labelled cell rectangle is supplied to detection or recognition. Slight baseline offsets must not reverse the reader's word order inside a header.

The structural metric matches tables/cells one-to-one at IoU ≥ 0.8 and separately counts missed/extra tables and cells, row/column assignments, merges, spanning headers and exact placed text. Text read inside the earlier known rectangles remains a separate baseline. A correct grid with a wrong date is still a wrong date.

Rule removal keeps the original image unchanged. An ink-projection heuristic detects the text-line axis and may rotate clockwise by 90 degrees. Every output records original dimensions and the exact coordinate transform; all OCR/table boxes map back to the original pixels. This does not solve 180-degree orientation, arbitrary skew, unruled tables, semantic headers or diagram relationships. The detector canvas is explicitly limited to 960 pixels with magnification 1.0; resolution/quality changes are part of this measured configuration.

## Measured result and limits

The [retained complete matrices](structure-2026-11-18.json) contain two equivalent ten-page runs for each admitted configuration, with source/model/configuration hashes, all recognized text, independent labels, resource observations and every literal critical error. Repeated pages are equivalent work, not independent samples of an unknown document population. No private-corpus accuracy, unattended fact acceptance, human time saving or proprietary/frontier parity follows.

Each EasyOCR run recovers 15 of 20 critical literals. Each Tesseract fast/best repetition recovers 10 of 20. EasyOCR detects both labelled tables without an extra table on the eight negative pages, matches all 10 cell geometries and their spans, and reads 7 of 10 cell texts exactly. Both spanning title cells are structurally recovered but their punctuation is not exact. The Russian table date is read `18.1l.2026` instead of `18.11.2026`; neither low-resolution noisy page yields its two exact critical literals. Original and recognized values remain visible, with no automatic numeric correction.

EasyOCR uses considerably more CPU time and memory than the Tesseract baselines in this cold-page worker. Exact observations are in each matrix; they include model initialization on every page and do not predict a persistent process. Retain Tesseract for the economical baseline and native PDF/DOCX text extraction for normal application intake. EasyOCR plus grid reconstruction is a candidate for a separately qualified optional local OCR path when the extra quality is useful. A production choice still needs representative privately labelled Russian/Romanian scans and acceptable critical-value/placement error thresholds.

## Reproduce

Use the ordinary official CPU package/model installation on an existing machine; the runner downloads and installs nothing. Place the exact EasyOCR weights under `MODEL_DIRECTORY/easyocr/` and retain `fast/` and `best/` from the earlier README. Download model archives from the pinned URLs manually, extract only their named `.pth` files, and verify the committed hashes. The worker disables EasyOCR's automatic downloads and uses a private temporary user-network directory.

```sh
python3 -m unittest discover -s tools/ocr-benchmark -p 'test_*.py'
python3 tools/ocr-benchmark/benchmark.py generate --output NEW_FIXTURES
python3 tools/ocr-benchmark/benchmark.py run --fixtures NEW_FIXTURES --models MODEL_DIRECTORY --output NEW_EASY_RUN_1 --engines easyocr --repeat 1
python3 tools/ocr-benchmark/benchmark.py run --fixtures NEW_FIXTURES --models MODEL_DIRECTORY --output NEW_EASY_RUN_2 --engines easyocr --repeat 1
python3 tools/ocr-benchmark/benchmark.py run --fixtures NEW_FIXTURES --models MODEL_DIRECTORY --output NEW_TESSERACT_RUN --engines fast,best --repeat 2
python3 tools/ocr-benchmark/summarize.py --fixtures NEW_FIXTURES --reports NEW_EASY_RUN_1/report.json NEW_EASY_RUN_2/report.json NEW_TESSERACT_RUN/report.json --output NEW_SUMMARY.json
python3 tools/ocr-benchmark/preview.py --fixtures NEW_FIXTURES --report NEW_EASY_RUN_1/report.json --output NEW_PREVIEWS
```

All output directories/files are new; an existing result is never overwritten. The summary refuses different work, different source recipes, changed structural labels or a report whose source hashes no longer match the checked-out recipe. It retains incomplete rows; a partial matrix is not a completed inference result. Pure metric/shape tests remain registered in the existing Node script suite and require neither a model nor a network. Prepared previews must be inspected before publication. Real originals, labels and recognized text must stay on their owner's private machine.

## Resource and failure evidence

The existing limits remain: serial execution, one CPU thread, 5 MiB source, 8 million pixels, 20 seconds per inference and a 180-second matrix deadline. EasyOCR has an explicit 4 GiB address-space ceiling for its runtime; Tesseract retains 1 GiB. CPU/file limits, sampled child RSS, timeout/interruption accounting and process-group reaping remain in the shared runner. EasyOCR weights are bounded to 128 MiB each; bounded layout JSON adds no uncontrolled output. Two separate equivalent EasyOCR runs fit the matrix deadline without expanding it.

Earlier actual attempts remain retained as [nonqualifying evidence](structure-attempts-2026-11-18.json): RapidOCR 3.10.0/ONNX Runtime installed successfully, but its official ModelScope model download and Hugging Face repository access returned403; no RapidOCR inference is claimed. An initial EasyOCR user-network directory pointed to the read-only home and was corrected to a private directory. A 64 MiB archive cap refused the official CRAFT archive; the bounded setup then admitted its known 83 MB weight. Default/1280-pixel detector attempts exceeded the existing 20-second deadline and remain timeout rows; a direct 1280-pixel probe completed outside that qualification budget. Trying every crop rotation also chose `1` over the full date on the hand example. The admitted 960-pixel configuration uses the stated limited orientation policy instead. A header-order regression was reproduced on actual table output and corrected through the shared cell alignment function. None of these earlier failures is counted as an admitted completed matrix.
