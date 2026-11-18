"""One bounded CPU-only EasyOCR invocation; paths are local and downloads disabled."""
import json
import math
from pathlib import Path
import sys


def main():
    import cv2
    import numpy as np
    import torch
    import easyocr
    from layout import reconstruct_grid, parse_structure
    from metrics import cell_metrics
    cv2.setNumThreads(1)
    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)
    image_path, output, models, language = sys.argv[1:]
    image_path, output, models = Path(image_path), Path(output), Path(models)
    if language not in ('ron', 'rus'):
        raise ValueError('unsupported_language')
    image = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
    if image is None or image.size > 8_000_000:
        raise ValueError('invalid_image')
    height, width = image.shape
    ink = cv2.threshold(image, 180, 255, cv2.THRESH_BINARY_INV)[1]
    horizontal = cv2.morphologyEx(ink, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (max(30, width // 20), 1)))
    vertical = cv2.morphologyEx(ink, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(30, height // 20))))
    lines = cv2.bitwise_or(horizontal, vertical)
    count, components, stats, _ = cv2.connectedComponentsWithStats(lines)
    tables = []
    for label in range(1, count):
        x, y, w, h, _ = stats[label].tolist()
        if w < 80 or h < 40:
            continue
        mask = np.uint8(components == label) * 255

        def segments(raster, along_x):
            number, _, boxes, _ = cv2.connectedComponentsWithStats(cv2.bitwise_and(raster, mask))
            result = []
            for i in range(1, number):
                left, top, wide, high, _ = boxes[i].tolist()
                if along_x and wide >= 30:
                    result.append([left, round(top + (high - 1) / 2), left + wide - 1, round(top + (high - 1) / 2)])
                elif not along_x and high >= 30:
                    result.append([round(left + (wide - 1) / 2), top, round(left + (wide - 1) / 2), top + high - 1])
            return result

        tables.extend(reconstruct_grid(segments(horizontal, True), segments(vertical, False)))
    parse_structure(tables, (width, height))
    processed = image.copy()
    processed[lines > 0] = 255
    # Detect only the text-line axis. The clockwise direction is an explicit
    # policy, not evidence about 180-degree orientation or reading semantics.
    remaining = processed < 180
    clockwise = float(np.var(remaining.sum(axis=0))) > 2 * float(np.var(remaining.sum(axis=1)))
    if clockwise:
        processed = np.rot90(processed, 3).copy()
    reader = easyocr.Reader(['ru', 'en'] if language == 'rus' else ['ro', 'en'],
                            gpu=False, model_storage_directory=str(models),
                            user_network_directory=str(output.parent / 'user-network'),
                            download_enabled=False, verbose=False)
    results = reader.readtext(processed, detail=1, paragraph=False, workers=0, batch_size=1,
                              canvas_size=960, mag_ratio=1.0)
    words = []
    for points, text, confidence in results:
        if not isinstance(text, str) or not text.strip() or len(text) > 1000 or any(ord(c) < 32 for c in text):
            raise ValueError('invalid_recognized_text')
        points = [(float(p[1]), height - float(p[0])) if clockwise else (float(p[0]), float(p[1])) for p in points]
        if not all(math.isfinite(v) for point in points for v in point) or not math.isfinite(float(confidence)):
            raise ValueError('invalid_ocr_geometry')
        left = max(0, math.floor(min(p[0] for p in points)))
        top = max(0, math.floor(min(p[1] for p in points)))
        right = min(width, math.ceil(max(p[0] for p in points)))
        bottom = min(height, math.ceil(max(p[1] for p in points)))
        if right <= left or bottom <= top:
            raise ValueError('invalid_ocr_geometry')
        words.append({'text': text.strip(), 'box': [left, top, right - left, bottom - top], 'confidence': float(confidence) * 100})
    for table in tables:
        aligned = cell_metrics(table['cells'], words)['alignedText']
        for cell, value in zip(table['cells'], aligned):
            cell['text'] = value
    header = 'level page_num block_num par_num line_num word_num left top width height conf text'.split()
    rows = ['\t'.join(header)]
    for i, word in enumerate(words, 1):
        rows.append('\t'.join(map(str, [5, 1, 1, 1, i, 1, *word['box'], word['confidence'], word['text']])))
    output.with_suffix('.tsv').write_text('\n'.join(rows) + '\n')
    output.with_suffix('.layout.json').write_text(json.dumps({
        'schema': 'automatic-ruled-table-proposals/v1', 'tables': tables,
        'preprocessing': {'originalSize': [width, height], 'clockwiseDegrees': 90 if clockwise else 0,
                          'originalToProcessed': [0, -1, height, 1, 0, 0] if clockwise else [1, 0, 0, 0, 1, 0],
                          'ruleRemoval': True, 'orientationPolicy': 'ink-axis-clockwise-90-only',
                          'detectorCanvasSize': 960, 'detectorMagnification': 1.0,
                          'unsupported': ['180_degree_disambiguation', 'unruled_tables', 'semantic_headers', 'diagram_relationships']},
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
