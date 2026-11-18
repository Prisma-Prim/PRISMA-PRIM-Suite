import unittest
import hashlib
import json
import os
from pathlib import Path
import tempfile
import time
from benchmark import character_metrics, parse_tsv, cell_metrics, critical_metrics, load_fixtures, read_bounded, select, UNSUPPORTED
from benchmark import infer

class MetricsTest(unittest.TestCase):
    def test_independent_character_denominator(self):
        self.assertEqual(character_metrics('abc', 'axcd'), {'expected': 3, 'observed': 4, 'edits': 2, 'cer': 2 / 3})
        self.assertIsNone(character_metrics('', '')['cer'])
        self.assertEqual(character_metrics('Știință', 'Stiinta')['edits'], 3)

    def test_alignment_matters_even_when_word_bag_is_identical(self):
        cells = [{'text': '001', 'box': [0, 0, 50, 20]}, {'text': '002', 'box': [50, 0, 50, 20]}]
        words = [{'text': '002', 'box': [5, 2, 20, 10]}, {'text': '001', 'box': [55, 2, 20, 10]}]
        self.assertEqual(cell_metrics(cells, words)['exact'], 0)
        self.assertEqual(cell_metrics(cells, words)['expected'], 2)

    def test_rejects_malformed_or_out_of_page_ocr_results(self):
        for value in ('not tsv', 'level\ttext\n5\tSECRET', 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n5\t1\t1\t1\t1\t1\t90\t0\t20\t10\t95\tSECRET'):
            with self.assertRaises(ValueError): parse_tsv(value, (100, 100))

    def test_valid_tsv_and_nonfinite_confidence(self):
        header = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n'
        row = '5\t1\t1\t1\t1\t1\t5\t3\t20\t10\t95.1\tȘtiință'
        self.assertEqual(parse_tsv(header + row, (100, 100)), [{'text': 'Știință', 'box': [5, 3, 20, 10]}])
        for confidence in ['nan', 'inf', '101', '-2']:
            with self.assertRaises(ValueError): parse_tsv(header + row.replace('95.1', confidence), (100, 100))

    def test_critical_occurrences_are_not_substrings_or_reused(self):
        self.assertEqual(critical_metrics(['001', '001', '18.11.2026'], '001 0001 18.11.2026'), {'expected': 3, 'matched': 2, 'missing': 1, 'recall': 2 / 3})

    def test_nfc_normalization_does_not_hide_diacritic_errors_or_insertions(self):
        self.assertEqual(character_metrics('ș', 's\u0326')['edits'], 0)
        self.assertEqual(character_metrics('abc', 'abcdefg')['cer'], 4 / 3)
        with self.assertRaises(ValueError): character_metrics('x' * 4001, '')

    def test_ambiguous_cell_center_is_refused(self):
        cells = [{'text': 'a', 'box': [0, 0, 50, 20]}, {'text': 'b', 'box': [0, 0, 50, 20]}]
        with self.assertRaises(ValueError): cell_metrics(cells, [{'text': 'a', 'box': [2, 2, 10, 10]}])

    def test_no_cells_is_unknown_quality(self):
        self.assertIsNone(cell_metrics([], [])['accuracy'])

    def test_fixture_manifest_rejects_traversal_bad_hash_overlap_and_unbounded_text(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'source.png').write_bytes(b'fictional-placeholder')
            page = {'id': 'ro-clean', 'language': 'ro', 'path': 'source.png', 'sha256': hashlib.sha256(b'fictional-placeholder').hexdigest(),
                    'width': 100, 'height': 100, 'text': 'Știință', 'critical': [], 'cells': [], 'unsupported': UNSUPPORTED}
            def load():
                (root / 'manifest.json').write_text(json.dumps({'schema': 'fictional-ocr-fixtures/v1', 'pages': [page]}))
                return load_fixtures(root)
            self.assertEqual(len(load()['pages']), 1)
            for key, value in [('path', '../source.png'), ('sha256', '0' * 64), ('text', 'x' * 4001), ('width', 999999), ('id', '../../invalid')]:
                prior = page[key]
                page[key] = value
                with self.assertRaises(ValueError): load()
                page[key] = prior
            page['cells'] = [{'text': 'a', 'box': [0, 0, 80, 20]}, {'text': 'b', 'box': [40, 0, 50, 20]}]
            with self.assertRaises(ValueError): load()

    def test_fifo_and_symlink_inputs_are_refused_before_reading(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            os.mkfifo(root / 'pipe')
            (root / 'link').symlink_to(root / 'pipe')
            for name in ['pipe', 'link']:
                with self.assertRaises((ValueError, OSError)): read_bounded(root / name, 1024)

    def test_configuration_selection_is_bounded_and_exact(self):
        self.assertEqual(select('best,fast', ['fast', 'best']), ['best', 'fast'])
        for value in ['fast,fast', 'network', '../best', ',']:
            with self.assertRaises(ValueError): select(value, ['fast', 'best'])

    def test_critical_numeric_continuations_never_count_as_whole_values(self):
        for expected, observed in [('0012345678901', '0.0012345678901'), ('18.11.2026', '18.11.2026.7'), ('001', '+001'), ('001', '001%'), ('001', '9/001')]:
            self.assertEqual(critical_metrics([expected], observed)['matched'], 0)
        self.assertEqual(critical_metrics(['001'], 'Identifier: 001.')['matched'], 1)

    def test_native_process_deadline_kills_and_reaps_the_child(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fake = root / 'fake-tesseract'
            fake.write_text('#!/usr/bin/env python3\nimport os,sys,time\nfrom pathlib import Path\nPath(sys.argv[1]).write_text(str(os.getpid()))\ntime.sleep(20)\n')
            fake.chmod(0o700)
            pid_file = root / 'pid'
            observation, tsv = infer(str(fake), pid_file, root, 'ron', time.monotonic() + .3, {'stop': False})
            self.assertEqual(observation['status'], 'timeout')
            self.assertIsNone(tsv)
            self.assertEqual(observation['exitCode'], -9)
            if pid_file.exists():
                with self.assertRaises(ProcessLookupError): os.kill(int(pid_file.read_text()), 0)

    def test_native_process_interruption_kills_and_reaps_the_child(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fake = root / 'fake-tesseract'
            fake.write_text('#!/usr/bin/env python3\nimport time\ntime.sleep(20)\n')
            fake.chmod(0o700)
            observation, tsv = infer(str(fake), root / 'image', root, 'ron', time.monotonic() + 2, {'stop': True})
            self.assertEqual(observation['status'], 'interrupted')
            self.assertIsNone(tsv)
            self.assertEqual(observation['exitCode'], -9)

if __name__ == '__main__': unittest.main()
