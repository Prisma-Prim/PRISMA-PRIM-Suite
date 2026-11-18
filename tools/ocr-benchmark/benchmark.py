"""Bounded offline OCR evaluation. Public metric seam also supports stdlib-only tests."""
from metrics import character_metrics, parse_tsv, cell_metrics, critical_metrics
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import resource
import re
import stat
import shutil
import signal
import subprocess
import sys
import tempfile
import time

from fixtures import generate, UNSUPPORTED

MAX_PIXELS = 8_000_000
MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_CASE_SECONDS = 20
MAX_RUN_SECONDS = 180


def read_bounded(path, maximum):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, 'rb') as stream:
        metadata = os.fstat(stream.fileno())
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > maximum:
            raise ValueError('invalid_file')
        value = stream.read(maximum + 1)
    if len(value) > maximum:
        raise ValueError('file_size_limit')
    return value



def load_fixtures(directory):
    manifest = json.loads(read_bounded(directory / 'manifest.json', 128 * 1024))
    if not isinstance(manifest, dict) or manifest.get('schema') != 'fictional-ocr-fixtures/v1' or not isinstance(manifest.get('pages'), list) or not 1 <= len(manifest['pages']) <= 20:
        raise ValueError('invalid_manifest')
    seen = set()
    for page in manifest['pages']:
        if (not isinstance(page, dict) or set(page) != {'id', 'language', 'path', 'sha256', 'width', 'height', 'text', 'critical', 'cells', 'unsupported'}
                or not isinstance(page['id'], str) or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,79}', page['id']) or page['id'] in seen
                or page['language'] not in ('ro', 'ru')
                or not isinstance(page['path'], str) or Path(page['path']).name != page['path']
                or '/' in page['path'] or '\\' in page['path'] or not page['path'].endswith('.png')
                or any(type(page[key]) is not int or page[key] < 1 or page[key] > 4000 for key in ('width', 'height'))
                or page['width'] * page['height'] > MAX_PIXELS
                or not isinstance(page['text'], str) or not 1 <= len(page['text']) <= 4000
                or not isinstance(page['critical'], list) or len(page['critical']) > 40
                or any(not isinstance(value, str) or not value or len(value) > 100 for value in page['critical'])
                or not isinstance(page['cells'], list) or len(page['cells']) > 100
                or page['unsupported'] != UNSUPPORTED):
            raise ValueError('invalid_manifest')
        seen.add(page['id'])
        for cell in page['cells']:
            if (not isinstance(cell, dict) or set(cell) != {'text', 'box'} or not isinstance(cell['text'], str) or not cell['text'] or len(cell['text']) > 1000
                    or not isinstance(cell['box'], list) or len(cell['box']) != 4
                    or any(type(v) is not int or v < 0 for v in cell['box'])):
                raise ValueError('invalid_manifest')
            x, y, width, height = cell['box']
            if width < 1 or height < 1 or x + width > page['width'] or y + height > page['height']:
                raise ValueError('invalid_manifest')
        for index, left in enumerate(page['cells']):
            for right in page['cells'][index + 1:]:
                a, b = left['box'], right['box']
                if max(a[0], b[0]) < min(a[0] + a[2], b[0] + b[2]) and max(a[1], b[1]) < min(a[1] + a[3], b[1] + b[3]):
                    raise ValueError('overlapping_labelled_cells')
        if hashlib.sha256(read_bounded(directory / page['path'], MAX_FILE_BYTES)).hexdigest() != page['sha256']:
            raise ValueError('fixture_hash_mismatch')
    return manifest


def child_limits():
    resource.setrlimit(resource.RLIMIT_AS, (1024 * 1024 * 1024, 1024 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_FSIZE, (8 * 1024 * 1024, 8 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_CPU, (20, 21))


def infer(binary, image, model_directory, language, deadline, control):
    start = time.monotonic()
    peak_rss = 0
    before = resource.getrusage(resource.RUSAGE_CHILDREN)
    with tempfile.TemporaryDirectory(prefix='fictional-ocr-') as temporary:
        output = Path(temporary) / 'ocr'
        argv = [binary, str(image), str(output), '--tessdata-dir', str(model_directory),
                '-l', language, '--oem', '1', '--psm', '6', '-c', 'tessedit_create_tsv=1', '-c', 'tessedit_create_txt=0']
        with (Path(temporary) / 'stderr').open('wb') as errors:
            process = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=errors,
                                       env={'PATH': os.environ.get('PATH', ''), 'LANG': 'C.UTF-8', 'OMP_THREAD_LIMIT': '1'},
                                       start_new_session=True, preexec_fn=child_limits)
            state = 'completed'
            while process.poll() is None:
                try:
                    status = Path(f'/proc/{process.pid}/status').read_text()
                    rss = next((line.split()[1] for line in status.splitlines() if line.startswith('VmRSS:')), '0')
                    peak_rss = max(peak_rss, int(rss) * 1024)
                except (OSError, ValueError):
                    pass
                if control['stop'] or time.monotonic() >= deadline:
                    state = 'interrupted' if control['stop'] else 'timeout'
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    process.wait()
                    break
                try:
                    process.wait(timeout=.02)
                except subprocess.TimeoutExpired:
                    pass
        after = resource.getrusage(resource.RUSAGE_CHILDREN)
        observation = {'status': state, 'exitCode': process.returncode,
                       'wallSeconds': time.monotonic() - start, 'sampledPeakRssBytes': peak_rss,
                       'rssSamplingSeconds': .02, 'childCpuSeconds': after.ru_utime + after.ru_stime - before.ru_utime - before.ru_stime}
        if state != 'completed' or process.returncode != 0:
            observation['status'] = state if state != 'completed' else 'failed'
            observation['error'] = 'inference_incomplete'
            return observation, None
        try:
            tsv = read_bounded(output.with_suffix('.tsv'), 8 * 1024 * 1024).decode('utf-8')
        except (OSError, ValueError, UnicodeError):
            return {**observation, 'status': 'failed', 'error': 'missing_or_invalid_result'}, None
        return observation, tsv


def select(value, allowed):
    selected = value.split(',') if value else list(allowed)
    if not selected or len(set(selected)) != len(selected) or any(item not in allowed for item in selected):
        raise ValueError('invalid_selection')
    return selected


def run(options):
    from PIL import Image
    if sys.platform != 'linux':
        raise ValueError('linux_required_for_bounded_process_resources')
    fixtures = load_fixtures(options.fixtures)
    case_ids = select(options.cases, [page['id'] for page in fixtures['pages']])
    pages = [page for page in fixtures['pages'] if page['id'] in case_ids]
    facts = json.loads((Path(__file__).parent / 'models.json').read_text())
    engines = select(options.engines, facts['configurations'])
    binary = shutil.which('tesseract')
    version = subprocess.run([binary, '--version'], capture_output=True, text=True, timeout=5).stdout.splitlines()[0] if binary else 'unavailable'
    config_states = {}
    for engine in engines:
        try:
            if version != facts['engineVersion']:
                raise ValueError('engine_version_mismatch')
            for language in {page['language'] for page in pages}:
                key = {'ro': 'ron', 'ru': 'rus'}[language]
                model = read_bounded(options.models / engine / f'{key}.traineddata', 32 * 1024 * 1024)
                if hashlib.sha256(model).hexdigest() != facts['configurations'][engine][key]:
                    raise ValueError('model_hash_mismatch')
            config_states[engine] = 'available'
        except (OSError, ValueError):
            config_states[engine] = 'configuration_unavailable'
    options.output.mkdir(parents=True, exist_ok=False)
    control = {'stop': False}
    def stop(_signum, _frame):
        control['stop'] = True
    previous_handlers = {s: signal.signal(s, stop) for s in (signal.SIGINT, signal.SIGTERM)}
    started = time.monotonic()
    started_at = datetime.now(timezone.utc).isoformat()
    rows = []
    try:
        for repetition in range(1, options.repeat + 1):
            # Alternate order in repeat2; preserve all observations rather than picking a fast pass.
            for engine in engines if repetition == 1 else list(reversed(engines)):
                for page in pages:
                    row = {'run': repetition, 'engine': engine, 'case': page['id'], 'language': page['language'],
                           'fixtureSha256': page['sha256'], 'unsupported': page['unsupported']}
                    rows.append(row)
                    if control['stop'] or time.monotonic() - started >= MAX_RUN_SECONDS:
                        row.update(status='not_run', error='interrupted' if control['stop'] else 'run_budget')
                        continue
                    if config_states[engine] != 'available':
                        row.update(status='failed', error=config_states[engine])
                        continue
                    try:
                        image = options.fixtures / page['path']
                        if hashlib.sha256(read_bounded(image, MAX_FILE_BYTES)).hexdigest() != page['sha256']:
                            raise ValueError('fixture_hash_mismatch')
                        with Image.open(image) as raster:
                            if raster.size != (page['width'], page['height']) or raster.width * raster.height > MAX_PIXELS:
                                raise ValueError('invalid_image_dimensions')
                            raster.verify()
                        observation, tsv = infer(binary, image, options.models / engine, {'ro': 'ron', 'ru': 'rus'}[page['language']],
                                                 min(started + MAX_RUN_SECONDS, time.monotonic() + MAX_CASE_SECONDS), control)
                        row.update(observation)
                        if tsv is not None:
                            words = parse_tsv(tsv, (page['width'], page['height']))
                            text = ' '.join(word['text'] for word in words)
                            row.update(text=character_metrics(page['text'], text), critical=critical_metrics(page['critical'], text),
                                       cells=cell_metrics(page['cells'], words), observedText=text, words=words)
                            row['qualityStatus'] = 'literal_mismatch' if row['text']['edits'] or row['critical']['missing'] or row['cells']['missingOrWrong'] else 'exact_on_labels'
                    except (OSError, ValueError, UnicodeError, SyntaxError, Image.DecompressionBombError):
                        row.update(status='failed', error='invalid_input_or_result')
    finally:
        for signum, handler in previous_handlers.items():
            signal.signal(signum, handler)
    report = {'schema': 'fictional-local-ocr-comparison/v1', 'kind': 'actual_inference_on_fictional_prepared_examples',
              'sourceInputHashes': {name: hashlib.sha256((Path(__file__).parent / name).read_bytes()).hexdigest() for name in ['benchmark.py', 'fixtures.py', 'metrics.py', 'models.json']},
              'invocation': ['python3', 'tools/ocr-benchmark/benchmark.py', 'run', '--fixtures', 'LOCAL_FICTIONAL_FIXTURE_DIRECTORY', '--models', 'PINNED_LOCAL_MODEL_DIRECTORY', '--output', 'NEW_PRIVATE_RESULT_DIRECTORY', '--engines', options.engines, '--repeat', str(options.repeat)] + (['--cases', options.cases] if options.cases else []),
              'startedAt': started_at, 'finishedAt': datetime.now(timezone.utc).isoformat(),
              'machine': {'platform': platform.system(), 'release': platform.release(), 'arch': platform.machine(),
                          'logicalCpus': os.cpu_count(), 'python': platform.python_version()},
              'engineVersion': version, 'engineBinarySha256': hashlib.sha256(Path(binary).read_bytes()).hexdigest() if binary else None,
              'models': {key: facts['configurations'][key] for key in engines},
              'fixtureManifestSha256': hashlib.sha256((options.fixtures / 'manifest.json').read_bytes()).hexdigest(),
              'bounds': {'concurrentProcesses': 1, 'threads': 1, 'perCaseSeconds': MAX_CASE_SECONDS,
                         'runSeconds': MAX_RUN_SECONDS, 'childAddressSpaceBytes': 1024 * 1024 * 1024,
                         'childFileBytes': 8 * 1024 * 1024, 'sourceBytes': MAX_FILE_BYTES, 'pixels': MAX_PIXELS},
              'accounting': {'planned': len(rows), 'completed': sum(r['status'] == 'completed' for r in rows),
                             'failed': sum(r['status'] == 'failed' for r in rows),
                             'incomplete': sum(r['status'] in ('timeout', 'interrupted', 'not_run') for r in rows)},
              'results': rows}
    report['status'] = 'completed' if report['accounting']['completed'] == report['accounting']['planned'] else 'partial'
    (options.output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    return report


def main():
    parser = argparse.ArgumentParser(description='Offline fictional RU/RO OCR comparison. No network, model training or production integration.')
    commands = parser.add_subparsers(dest='command', required=True)
    fixture = commands.add_parser('generate', help='Create independently labelled fictional pages in a new local directory.')
    fixture.add_argument('--output', type=Path, required=True)
    inference = commands.add_parser('run', help='Run pinned local weights; output contains fictional source/OCR text and stays local until inspected.')
    inference.add_argument('--fixtures', type=Path, required=True)
    inference.add_argument('--models', type=Path, required=True)
    inference.add_argument('--output', type=Path, required=True)
    inference.add_argument('--engines', default='fast,best')
    inference.add_argument('--cases')
    inference.add_argument('--repeat', type=int, choices=[1, 2], default=2)
    options = parser.parse_args()
    try:
        if options.command == 'generate':
            manifest = generate(options.output)
            print(json.dumps({'status': 'generated', 'pages': len(manifest['pages'])}))
        else:
            report = run(options)
            print(json.dumps({'status': report['status'], 'accounting': report['accounting']}))
            return 0 if report['status'] == 'completed' else 1
    except (OSError, ValueError, KeyError, TypeError, IndexError, subprocess.SubprocessError):
        print('{"status":"invalid_input_or_environment"}')
        return 2
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
