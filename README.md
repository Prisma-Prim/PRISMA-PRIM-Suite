# Free local OCR and table structure — fictional proof

Issue [#1455](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1455), source `91dc9241e9fa420c07149a8ecf484213478fe987`. These are actual CPU inferences on ten independently labelled generated Russian/Romanian pages. No private document, paid API or application OCR rollout is involved.

[Measured results](measured.json) retain60 admitted calls: two equivalent ten-page EasyOCR runs, and two repetitions each of Tesseract fast/best. Every admitted call completed. Each EasyOCR run recovers15/20 exact critical literals; each Tesseract repetition10/20. Automatic geometry finds both labelled ruled tables, all10 cells/spans and both spanning headers;7/10 cell texts are exact. The Russian table date `18.1l.2026` and noisy-page values remain errors. A correct cell grid does not validate its contents.

The [contact sheet](contact-sheet.png), [Romanian table](easyocr-ro-grid-merged.png), [Russian table](easyocr-ru-grid-merged.png), [Romanian noise](easyocr-ro-noisy-low-resolution.png) and [Russian noise](easyocr-ru-noisy-low-resolution.png) were inspected. Red boxes are observed OCR regions; green is independent cell truth and blue is automatically detected structure. Original-coordinate mappings and exact hashes are in [proof.json](proof.json) and the measured report. The blue detector never receives the green labels.

[Earlier failed/over-budget attempts](attempts.json) remain visible. [Earlier calibration matrices](earlier-calibrations) are additional real work with earlier recipe hashes, not extra independent pages or current qualification. The headline60 is the admitted final measurement, not the total effort of this session. A slight-baseline header-order error was corrected before the admitted run; no error was normalized away.

EasyOCR's CPU runtime and official weights are free to run under the documented project licence; CPU time, memory and hardware are still costs. This cold-page implementation is materially slower and uses more memory than Tesseract. It does not measure a persistent worker. The recommendation and pinned primary sources are in the source repository's `docs/qualification/local-ocr/structure.md`.

No unruled-table, semantic-header, arbitrary orientation/skew, diagram-relationship, private-corpus, unattended-fact or proprietary/frontier-parity claim is made. Required PR CI is tracked separately. No raw diagnostic log, model weight or private trace is published.
