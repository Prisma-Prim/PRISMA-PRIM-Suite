import unittest
from layout import reconstruct_grid, structure_metrics, parse_structure
from metrics import cell_metrics


class LayoutTest(unittest.TestCase):
    def test_header_fragments_retain_ocr_reading_order_despite_small_baseline_offsets(self):
        cells = [{'text': 'Dosar fictiv Știință', 'box': [0, 0, 100, 30]}]
        words = [{'text': 'Dosar fictiv', 'box': [5, 4, 40, 20]}, {'text': 'Știință', 'box': [50, 3, 30, 24]}]
        self.assertEqual(cell_metrics(cells, words)['alignedText'], ['Dosar fictiv Știință'])
        self.assertEqual(cell_metrics(cells, words)['exact'], 1)
    def test_merged_header_is_reconstructed_from_missing_internal_separator(self):
        h = [[0, 0, 100, 0], [0, 20, 100, 20], [0, 40, 100, 40], [0, 60, 100, 60]]
        v = [[0, 0, 0, 60], [50, 20, 50, 60], [100, 0, 100, 60]]
        tables = reconstruct_grid(h, v)
        self.assertEqual(len(tables), 1)
        self.assertEqual(tables[0]['cells'][0], {'box': [0, 0, 100, 20], 'row': 0, 'column': 0, 'rowSpan': 1, 'columnSpan': 2, 'text': '', 'kind': 'spanning_header'})
        self.assertEqual(len(tables[0]['cells']), 5)

    def test_a_rectangle_or_no_lines_is_not_a_table(self):
        self.assertEqual(reconstruct_grid([[0, 0, 100, 0], [0, 40, 100, 40]], [[0, 0, 0, 40], [100, 0, 100, 40]]), [])
        self.assertEqual(reconstruct_grid([], []), [])

    def test_correct_word_bag_with_swapped_cells_never_counts_as_correct_placement(self):
        cells = [dict(box=[0, 0, 50, 20], row=0, column=0, rowSpan=1, columnSpan=1, kind='cell', text='001'), dict(box=[50, 0, 50, 20], row=0, column=1, rowSpan=1, columnSpan=1, kind='cell', text='002')]
        expected = [dict(box=[0, 0, 100, 20], cells=cells)]
        actual = [dict(box=[0, 0, 100, 20], cells=[{**cells[0], 'text': '002'}, {**cells[1], 'text': '001'}])]
        result = structure_metrics(expected, actual)
        self.assertEqual(result['expectedCells'], 2)
        self.assertEqual(result['matchedCells'], 2)
        self.assertEqual(result['exactPlacedText'], 0)
        self.assertEqual(structure_metrics(expected, [])['missedCells'], 2)
        self.assertEqual(structure_metrics([], actual)['extraTables'], 1)

    def test_malformed_out_of_page_and_nonrectangular_structures_are_refused(self):
        for value in [None, [{'box': [0, 0, 200, 20], 'cells': []}], [{'box': [0, 0, 100, 100], 'cells': [{'box': [0, 0, 50, 20], 'row': 0, 'column': 0, 'rowSpan': 0, 'columnSpan': 1, 'text': '1', 'kind': 'cell'}]}]]:
            with self.assertRaises(ValueError): parse_structure(value, (100, 100))

    def test_wrong_row_and_merge_are_reported_even_when_geometry_and_text_match(self):
        expected = [{'box': [0, 0, 100, 20], 'cells': [{'box': [0, 0, 100, 20], 'row': 0, 'column': 0, 'rowSpan': 1, 'columnSpan': 2, 'text': '001', 'kind': 'spanning_header'}]}]
        observed = [{'box': [0, 0, 100, 20], 'cells': [{**expected[0]['cells'][0], 'row': 1, 'columnSpan': 1}]}]
        result = structure_metrics(expected, observed)
        self.assertEqual(result['wrongAssignments'], 1)
        self.assertEqual(result['wrongMerges'], 1)
        self.assertEqual(result['correctSpanningHeaders'], 0)
        self.assertEqual(result['expectedSpanningHeaders'], 1)
        self.assertEqual(result['exactPlacedText'], 0)

    def test_a_missing_horizontal_separator_can_merge_rows_without_changing_columns(self):
        h = [[0, 0, 100, 0], [50, 20, 100, 20], [0, 40, 100, 40], [0, 60, 100, 60]]
        v = [[0, 0, 0, 60], [50, 0, 50, 60], [100, 0, 100, 60]]
        table = reconstruct_grid(h, v)[0]
        self.assertEqual(table['cells'][0]['rowSpan'], 2)
        self.assertEqual(table['cells'][0]['columnSpan'], 1)


if __name__ == '__main__':
    unittest.main()
