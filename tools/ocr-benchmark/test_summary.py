import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from fixtures import UNSUPPORTED
from summarize import summarize


class SummaryTest(unittest.TestCase):
    def test_summary_refuses_stale_recipes_and_incomplete_work_sets(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            image = b'fictional metadata-only fixture, never inferred'
            (root / 'source.png').write_bytes(image)
            page = {'id': 'ro-clean', 'language': 'ro', 'path': 'source.png', 'sha256': hashlib.sha256(image).hexdigest(), 'width': 100, 'height': 100, 'text': '001 001', 'critical': ['001', '001'], 'cells': [], 'unsupported': UNSUPPORTED}
            manifest = {'schema': 'fictional-ocr-fixtures/v1', 'pages': [page]}
            (root / 'manifest.json').write_text(json.dumps(manifest))
            (root / 'structure-labels.json').write_text(json.dumps({'schema': 'fictional-table-labels/v1', 'pages': [{'case': 'ro-clean', 'imageSha256': page['sha256'], 'tables': []}]}))
            names = ['benchmark.py', 'fixtures.py', 'metrics.py', 'models.json', 'layout.py', 'easy_worker.py']
            hashes = {name: hashlib.sha256((Path(__file__).parent / name).read_bytes()).hexdigest() for name in names}
            report = {'schema': 'fictional-local-ocr-comparison/v1', 'fixtureManifestSha256': hashlib.sha256((root / 'manifest.json').read_bytes()).hexdigest(), 'sourceInputHashes': hashes.copy(),
                      'structureLabelsSha256': hashlib.sha256((root / 'structure-labels.json').read_bytes()).hexdigest(),
                      'results': [{'case': 'ro-clean', 'engine': 'easyocr', 'run': 1, 'status': 'timeout', 'wallSeconds': 20, 'error': 'inference_incomplete'}]}
            path = root / 'report.json'

            def read():
                path.write_text(json.dumps(report))
                return summarize(root, [path])

            result = read()
            self.assertEqual(result['groups'][0]['completed'], 0)
            self.assertEqual(result['groups'][0]['criticalExpected'], 2)
            self.assertEqual(result['matrices'][0]['results'][0]['status'], 'timeout')
            report['results'][0].update(status='completed', observedText='001', critical={'matched': 1, 'expected': 2}, text={'edits': 4, 'expected': 7})
            self.assertEqual(len(read()['criticalErrors']), 1)
            original_labels = (root / 'structure-labels.json').read_bytes()
            labels = json.loads(original_labels)
            labels['pages'][0]['tables'] = [{'box': [0, 0, 100, 100], 'cells': [{'box': [0, 0, 100, 100], 'row': 0, 'column': 0, 'rowSpan': 1, 'columnSpan': 1, 'text': '001', 'kind': 'cell'}]}]
            (root / 'structure-labels.json').write_text(json.dumps(labels))
            with self.assertRaisesRegex(ValueError, 'structural_labels_changed'): read()
            (root / 'structure-labels.json').write_bytes(original_labels)
            report['sourceInputHashes']['models.json'] = '0' * 64
            with self.assertRaisesRegex(ValueError, 'report_recipe_is_not_current'): read()
            report['sourceInputHashes'] = hashes.copy()
            report['results'][0]['case'] = 'ru-unknown'
            with self.assertRaisesRegex(ValueError, 'matrix_is_not_equivalent_work'): read()

    def test_summary_limits_number_of_reports_before_reading_any_source(self):
        for reports in [[], [Path('unused')] * 5]:
            with self.assertRaisesRegex(ValueError, 'report_count_limit'): summarize(Path('unused'), reports)


if __name__ == '__main__':
    unittest.main()
