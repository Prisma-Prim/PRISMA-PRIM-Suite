"""Independent, bounded literal metrics. No OCR or image library is needed here."""
import math
import re
import unicodedata


def normalize(text):
    return ' '.join(unicodedata.normalize('NFC', text).split())


def character_metrics(expected, observed):
    expected, observed = normalize(expected), normalize(observed)
    if max(len(expected), len(observed)) > 4000:
        raise ValueError('metric_text_limit')
    previous = list(range(len(observed) + 1))
    for i, left in enumerate(expected, 1):
        current = [i]
        for j, right in enumerate(observed, 1):
            current.append(min(current[-1] + 1, previous[j] + 1,
                               previous[j - 1] + (left != right)))
        previous = current
    edits = previous[-1]
    return {'expected': len(expected), 'observed': len(observed), 'edits': edits,
            'cer': edits / len(expected) if expected else None}


def parse_tsv(text, size):
    header = 'level page_num block_num par_num line_num word_num left top width height conf text'.split()
    lines = text.splitlines()
    if not lines or lines[0].split('\t') != header or len(text) > 8 * 1024 * 1024 or len(lines) > 20000:
        raise ValueError('invalid_tsv')
    words = []
    for line in lines[1:]:
        columns = line.split('\t', 11)
        if len(columns) != 12:
            raise ValueError('invalid_tsv')
        try:
            level, page, block, paragraph, row, word, x, y, width, height = map(int, columns[:10])
            confidence = float(columns[10])
        except ValueError:
            raise ValueError('invalid_tsv') from None
        if (level not in range(1, 6) or page != 1 or min(block, paragraph, row, word, x, y, width, height) < 0
                or x + width > size[0] or y + height > size[1]
                or not math.isfinite(confidence) or not -1 <= confidence <= 100
                or len(columns[11]) > 1000 or any(ord(c) < 32 for c in columns[11])):
            raise ValueError('invalid_tsv')
        if level == 5 and columns[11].strip() and confidence >= 0:
            words.append({'text': columns[11].strip(), 'box': [x, y, width, height]})
    return words


def cell_metrics(cells, words):
    aligned = [[] for _ in cells]
    outside = 0
    for word in words:
        x, y, width, height = word['box']
        center = (x + width / 2, y + height / 2)
        matches = [i for i, cell in enumerate(cells)
                   if cell['box'][0] <= center[0] < cell['box'][0] + cell['box'][2]
                   and cell['box'][1] <= center[1] < cell['box'][1] + cell['box'][3]]
        if len(matches) > 1:
            raise ValueError('ambiguous_cell_alignment')
        if matches:
            aligned[matches[0]].append(word['text'])
        else:
            outside += 1
    values = [' '.join(parts) for parts in aligned]
    exact = sum(normalize(cell['text']) == normalize(value) for cell, value in zip(cells, values))
    observed = sum(bool(value) for value in values)
    return {'expected': len(cells), 'observed': observed, 'exact': exact,
            'missingOrWrong': len(cells) - exact,
            'accuracy': exact / len(cells) if cells else None,
            'wordsOutsideLabelledCells': outside, 'alignedText': values}


def critical_metrics(expected, observed):
    # Count each independently labelled occurrence once; preserve leading zeroes and punctuation.
    remaining = {}
    for value in expected:
        remaining[value] = len(re.findall(r'(?<!\w)(?<!\d[.,/])(?<![+\-/%])' + re.escape(value) + r'(?!\w)(?![.,/]\d)(?![+\-/%])', normalize(observed)))
    matched = 0
    for value in expected:
        if remaining[value] > 0:
            matched += 1
            remaining[value] -= 1
    return {'expected': len(expected), 'matched': matched, 'missing': len(expected) - matched,
            'recall': matched / len(expected) if expected else None}
