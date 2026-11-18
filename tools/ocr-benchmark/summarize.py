"""Combine equivalent prepared matrices and retain literal critical errors, without extrapolation."""
import argparse
import hashlib
import json
from pathlib import Path
from benchmark import load_fixtures, read_bounded
from metrics import critical_metrics
from layout import parse_structure


def summarize(fixtures, reports):
    if not 1 <= len(reports) <= 4:
        raise ValueError('report_count_limit')
    manifest = load_fixtures(fixtures)
    label_bytes = read_bounded(fixtures / 'structure-labels.json', 128 * 1024)
    labels = json.loads(label_bytes)
    if not isinstance(labels, dict) or set(labels) != {'schema', 'pages'} or labels['schema'] != 'fictional-table-labels/v1' or not isinstance(labels['pages'], list) or len(labels['pages']) != len(manifest['pages']):
        raise ValueError('invalid_structural_labels')
    for page, label in zip(manifest['pages'], labels['pages']):
        if not isinstance(label, dict) or set(label) != {'case', 'imageSha256', 'tables'} or label['case'] != page['id'] or label['imageSha256'] != page['sha256']:
            raise ValueError('invalid_structural_labels')
        parse_structure(label['tables'], (page['width'], page['height']))
    matrices = []
    groups = []
    errors = []
    identities = None
    for index, path in enumerate(reports, 1):
        report = json.loads(read_bounded(path, 8 * 1024 * 1024))
        if (report.get('schema') != 'fictional-local-ocr-comparison/v1'
                or report.get('fixtureManifestSha256') != hashlib.sha256((fixtures / 'manifest.json').read_bytes()).hexdigest()
                or not isinstance(report.get('results'), list) or not 1 <= len(report['results']) <= 120):
            raise ValueError('not_equivalent_prepared_report')
        if identities is not None and identities != report['sourceInputHashes']:
            raise ValueError('source_configuration_changed')
        names = ['benchmark.py', 'fixtures.py', 'metrics.py', 'models.json', 'layout.py', 'easy_worker.py']
        if set(report['sourceInputHashes']) != set(names) or any(
                hashlib.sha256(read_bounded(Path(__file__).parent / name, 128 * 1024)).hexdigest() != report['sourceInputHashes'][name]
                for name in names):
            raise ValueError('report_recipe_is_not_current')
        identities = report['sourceInputHashes']
        matrices.append(report)
        for engine in sorted({row['engine'] for row in report['results']}):
            for repetition in sorted({row['run'] for row in report['results']}):
                rows = [r for r in report['results'] if r['engine'] == engine and r['run'] == repetition]
                if (engine == 'easyocr' or any('structure' in row or 'automaticLayout' in row for row in rows)) and report.get('structureLabelsSha256') != hashlib.sha256(label_bytes).hexdigest():
                    raise ValueError('structural_labels_changed')
                expected = {p['id'] for p in manifest['pages']}
                if {r['case'] for r in rows} != expected or len(rows) != len(expected):
                    raise ValueError('matrix_is_not_equivalent_work')
                done = [r for r in rows if r['status'] == 'completed']
                group = {'matrix': index, 'engine': engine, 'repetition': repetition,
                         'planned': len(rows), 'completed': len(done),
                         'criticalMatched': sum(r['critical']['matched'] for r in done),
                         'criticalExpected': sum(len(p['critical']) for p in manifest['pages']),
                         'wallSeconds': sum(r.get('wallSeconds', 0) for r in rows),
                         'sampledPeakRssBytes': max(r.get('sampledPeakRssBytes', 0) for r in rows),
                         'literalCharacterEdits': sum(r['text']['edits'] for r in done),
                         'expectedCharacters': sum(r['text']['expected'] for r in done)}
                structural = [r['structure'] for r in done if 'structure' in r]
                group['automaticStructure'] = {key: sum(r[key] for r in structural) for key in structural[0]} if structural else None
                groups.append(group)
                for row in done:
                    page = next(p for p in manifest['pages'] if p['id'] == row['case'])
                    for expected_value in dict.fromkeys(page['critical']):
                        occurrences = page['critical'].count(expected_value)
                        matched = critical_metrics([expected_value] * occurrences, row['observedText'])['matched']
                        for occurrence in range(matched + 1, occurrences + 1):
                            errors.append({'matrix': index, 'engine': engine, 'repetition': repetition,
                                           'case': row['case'], 'expectedLiteral': expected_value,
                                           'missingOccurrence': occurrence,
                                           'observedText': row['observedText']})
    return {'schema': 'fictional-local-ocr-structure-evaluation/v1',
            'kind': 'actual_inference_on_fictional_prepared_examples',
            'fixtureManifest': manifest,
            'independentStructureLabels': labels,
            'groups': groups, 'criticalErrors': errors, 'matrices': matrices,
            'limits': ['Prepared examples and repeated work are not independent population samples.',
                       'Automatic geometry/merge matching is separate from exact recognized cell text.',
                       'No unruled-table, semantic-header, diagram-relationship, 180-degree or frontier-parity claim.',
                       'Every EasyOCR page is cold-started; measurements do not predict a persistent service.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fixtures', type=Path, required=True)
    parser.add_argument('--reports', type=Path, nargs='+', required=True)
    parser.add_argument('--output', type=Path, required=True)
    options = parser.parse_args()
    value = summarize(options.fixtures, options.reports)
    with options.output.open('x') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
