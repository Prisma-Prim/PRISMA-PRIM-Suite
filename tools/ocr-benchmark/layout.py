"""Ruled-grid reconstruction and independent placement metrics; no image or OCR dependency."""
from metrics import normalize


def clusters(values, tolerance=4):
    groups = []
    for value in sorted(values):
        if groups and value - groups[-1][-1] <= tolerance:
            groups[-1].append(value)
        else:
            groups.append([value])
    return [round(sum(group) / len(group)) for group in groups]


def reconstruct_grid(horizontal, vertical):
    """One connected candidate grid, supplied by raster line detection, never labels."""
    xs = clusters([line[0] for line in vertical])
    ys = clusters([line[1] for line in horizontal])
    if not 3 <= len(xs) <= 21 or not 3 <= len(ys) <= 21 or (len(xs) - 1) * (len(ys) - 1) > 100:
        return []
    cols, rows = len(xs) - 1, len(ys) - 1
    parents = list(range(cols * rows))

    def root(index):
        while parents[index] != index:
            index = parents[index]
        return index

    def join(a, b):
        parents[root(a)] = root(b)

    def vertical_at(x, y):
        return any(abs(line[0] - x) <= 4 and min(line[1], line[3]) - 4 <= y <= max(line[1], line[3]) + 4 for line in vertical)

    def horizontal_at(x, y):
        return any(abs(line[1] - y) <= 4 and min(line[0], line[2]) - 4 <= x <= max(line[0], line[2]) + 4 for line in horizontal)

    for row in range(rows):
        for col in range(cols):
            index = row * cols + col
            if col + 1 < cols and not vertical_at(xs[col + 1], (ys[row] + ys[row + 1]) / 2):
                join(index, index + 1)
            if row + 1 < rows and not horizontal_at((xs[col] + xs[col + 1]) / 2, ys[row + 1]):
                join(index, index + cols)
    groups = {}
    for index in range(cols * rows):
        groups.setdefault(root(index), []).append(divmod(index, cols))
    cells = []
    for group in groups.values():
        top, bottom = min(r for r, _ in group), max(r for r, _ in group) + 1
        left, right = min(c for _, c in group), max(c for _, c in group) + 1
        if len(group) != (bottom - top) * (right - left):
            return []  # An L-shaped merge has no supported rectangular interpretation.
        cells.append({'box': [xs[left], ys[top], xs[right] - xs[left], ys[bottom] - ys[top]],
                      'row': top, 'column': left, 'rowSpan': bottom - top, 'columnSpan': right - left,
                      'text': '', 'kind': 'spanning_header' if top == 0 and right - left > 1 else 'cell'})
    if len(cells) < 4:
        return []
    cells.sort(key=lambda c: (c['row'], c['column']))
    return [{'box': [xs[0], ys[0], xs[-1] - xs[0], ys[-1] - ys[0]], 'cells': cells}]


def parse_structure(value, size):
    if not isinstance(value, list) or len(value) > 20:
        raise ValueError('invalid_table_output')

    def box(value):
        if (not isinstance(value, list) or len(value) != 4 or any(type(v) is not int or v < 0 for v in value)
                or value[2] < 1 or value[3] < 1 or value[0] + value[2] > size[0] or value[1] + value[3] > size[1]):
            raise ValueError('invalid_table_box')
        return value

    for table in value:
        if not isinstance(table, dict) or set(table) != {'box', 'cells'} or not isinstance(table['cells'], list) or not 1 <= len(table['cells']) <= 100:
            raise ValueError('invalid_table_output')
        outer = box(table['box'])
        for cell in table['cells']:
            if (not isinstance(cell, dict) or set(cell) != {'box', 'row', 'column', 'rowSpan', 'columnSpan', 'text', 'kind'}
                    or any(type(cell[k]) is not int or not 0 <= cell[k] < 20 for k in ('row', 'column'))
                    or any(type(cell[k]) is not int or not 1 <= cell[k] <= 20 for k in ('rowSpan', 'columnSpan'))
                    or not isinstance(cell['text'], str) or len(cell['text']) > 1000
                    or any(ord(c) < 32 for c in cell['text']) or cell['kind'] not in ('cell', 'spanning_header')):
                raise ValueError('invalid_table_cell')
            inner = box(cell['box'])
            if inner[0] < outer[0] or inner[1] < outer[1] or inner[0] + inner[2] > outer[0] + outer[2] or inner[1] + inner[3] > outer[1] + outer[3]:
                raise ValueError('invalid_table_cell')
            if cell['row'] + cell['rowSpan'] > 20 or cell['column'] + cell['columnSpan'] > 20:
                raise ValueError('invalid_table_cell')
    return value


def overlap(a, b):
    area = max(0, min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0])) * max(0, min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1]))
    return area / (a[2] * a[3] + b[2] * b[3] - area)


def match_boxes(expected, observed):
    # Highest-IoU one-to-one assignment, with the declared 0.8 threshold.
    pairs = sorted([(overlap(a['box'], b['box']), i, j) for i, a in enumerate(expected) for j, b in enumerate(observed)], reverse=True)
    left, right, matched = set(), set(), []
    for score, i, j in pairs:
        if score >= .8 and i not in left and j not in right:
            left.add(i); right.add(j); matched.append((i, j))
    return matched


def structure_metrics(expected, observed):
    matched = match_boxes(expected, observed)
    result = {'expectedTables': len(expected), 'observedTables': len(observed), 'matchedTables': len(matched),
              'missedTables': len(expected) - len(matched), 'extraTables': len(observed) - len(matched),
              'expectedCells': sum(len(t['cells']) for t in expected), 'observedCells': sum(len(t['cells']) for t in observed),
              'matchedCells': 0, 'correctAssignments': 0, 'correctMerges': 0, 'expectedSpanningHeaders': 0,
              'correctSpanningHeaders': 0, 'exactPlacedText': 0}
    result['expectedSpanningHeaders'] = sum(c['kind'] == 'spanning_header' for t in expected for c in t['cells'])
    for i, j in matched:
        a, b = expected[i]['cells'], observed[j]['cells']
        cells = match_boxes(a, b)
        result['matchedCells'] += len(cells)
        for x, y in cells:
            assignment = all(a[x][k] == b[y][k] for k in ('row', 'column'))
            merge = all(a[x][k] == b[y][k] for k in ('rowSpan', 'columnSpan'))
            result['correctAssignments'] += assignment
            result['correctMerges'] += merge
            result['correctSpanningHeaders'] += assignment and merge and a[x]['kind'] == b[y]['kind'] == 'spanning_header'
            result['exactPlacedText'] += assignment and merge and normalize(a[x]['text']) == normalize(b[y]['text'])
    result['missedCells'] = result['expectedCells'] - result['matchedCells']
    result['extraCells'] = result['observedCells'] - result['matchedCells']
    result['wrongAssignments'] = result['matchedCells'] - result['correctAssignments']
    result['wrongMerges'] = result['matchedCells'] - result['correctMerges']
    return result
