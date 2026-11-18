"""Reproduce image-codec and configuration failures through the real bounded CLI."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


def check(fixtures, models):
    with tempfile.TemporaryDirectory(prefix='fictional-ocr-failure-') as temporary:
        root = Path(temporary)
        source = root / 'fixtures'
        source.mkdir()
        manifest = json.loads((fixtures / 'manifest.json').read_text())
        manifest['pages'] = [p for p in manifest['pages'] if p['id'] in ['ro-clean', 'ru-clean']]
        assert len(manifest['pages']) == 2
        for page in manifest['pages']:
            shutil.copyfile(fixtures / page['path'], source / page['path'])
        first = manifest['pages'][0]
        path = source / first['path']
        data = bytearray(path.read_bytes())
        start = data.index(b'IDAT')
        length = int.from_bytes(data[start - 4:start], 'big')
        data[start + 4 + length] ^= 1  # Corrupt only the CRC, preserving dimensions and source bounds.
        path.write_bytes(data)
        first['sha256'] = hashlib.sha256(data).hexdigest()
        (source / 'manifest.json').write_text(json.dumps(manifest))
        observations = []
        for name, model_root in [('bad-png', models), ('missing-models', root / 'missing-models')]:
            output = root / name
            result = subprocess.run([sys.executable, str(Path(__file__).with_name('benchmark.py')), 'run',
                                     '--fixtures', str(source), '--models', str(model_root), '--output', str(output),
                                     '--engines', 'fast', '--repeat', '1'], capture_output=True, text=True, timeout=30)
            assert (output / 'report.json').is_file(), 'Native failure lost the partial report'
            report = json.loads((output / 'report.json').read_text())
            expected = {'planned': 2, 'completed': 1, 'failed': 1, 'incomplete': 0} if name == 'bad-png' else {'planned': 2, 'completed': 0, 'failed': 2, 'incomplete': 0}
            assert result.returncode == 1 and report['accounting'] == expected, 'Native failure accounting changed'
            assert 'Traceback' not in result.stderr, 'Native decoder error escaped the per-case boundary'
            observations.append({'case': name, 'exit': result.returncode, 'accounting': report['accounting'],
                                 'outcomes': [{k: row[k] for k in ['case', 'status', 'error'] if k in row} for row in report['results']]})
        return observations


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fixtures', type=Path, required=True)
    parser.add_argument('--models', type=Path, required=True)
    options = parser.parse_args()
    print(json.dumps(check(options.fixtures, options.models)))
