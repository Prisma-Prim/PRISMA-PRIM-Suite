"""Fictional source labels precede inference; geometrical transformations move the labels too."""
import hashlib
import json
from pathlib import Path
import random

UNSUPPORTED = ['diagram_relationships', 'stamp_authenticity', 'semantic_table_merge_reconstruction']


def generate(directory):
    from PIL import Image, ImageDraw, ImageFont, ImageFilter, __version__
    if __version__ != '12.3.0':
        raise ValueError('pillow_version_mismatch')
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=False)
    font_path = Path(__file__).resolve().parents[2] / 'apps/api/src/commercial-pdf/assets/DejaVuSans.ttf'
    font = ImageFont.truetype(str(font_path), 28)
    small = ImageFont.truetype(str(font_path), 24)
    pages = []
    for language, source in {
        'ro': {'title': 'Dosar fictiv — Știință și producție', 'name': 'Organizație: Exemplu Fictiv',
               'tax': 'Cod fiscal', 'date': 'Data auditului', 'stamp': 'COPIE FICTIVĂ',
               'diagram': 'Recepție → Control → Livrare'},
        'ru': {'title': 'Вымышленное дело — производство', 'name': 'Организация: ООО Пример',
               'tax': 'Фискальный код', 'date': 'Дата аудита', 'stamp': 'ВЫМЫШЛЕННАЯ КОПИЯ',
               'diagram': 'Приёмка → Контроль → Отгрузка'},
    }.items():
        for case in ['clean', 'grid-merged', 'rotated', 'noisy-low-resolution', 'stamp-diagram']:
            image = Image.new('RGB', (1100, 1400), 'white')
            draw = ImageDraw.Draw(image)
            lines = [source['title'], source['name'], f"{source['tax']}: 0012345678901", f"{source['date']}: 18.11.2026", 'ISO 9001:2015']
            cells = []
            if case == 'grid-merged':
                # One merged title spans the two columns; the following rows have independent cells.
                cells = [{'text': source['title'], 'box': [40, 60, 1020, 90]},
                         {'text': source['tax'], 'box': [40, 150, 510, 90]},
                         {'text': '0012345678901', 'box': [550, 150, 510, 90]},
                         {'text': source['date'], 'box': [40, 240, 510, 90]},
                         {'text': '18.11.2026', 'box': [550, 240, 510, 90]}]
                for cell in cells:
                    x, y, w, h = cell['box']
                    draw.rectangle((x, y, x + w, y + h), outline='black', width=2)
                    draw.text((x + 12, y + 25), cell['text'], font=font, fill='black')
                lines = [c['text'] for c in cells]
            else:
                for i, line in enumerate(lines):
                    draw.text((50, 70 + i * 75), line, font=font, fill='black')
            if case == 'stamp-diagram':
                draw.rectangle((45, 480, 1010, 565), outline='black', width=3)
                draw.text((60, 505), source['stamp'], font=small, fill='black')
                draw.text((50, 650), source['diagram'], font=font, fill='black')
                lines += [source['stamp'], source['diagram']]
            if case == 'rotated':
                image = image.rotate(90, expand=True)
            if case == 'noisy-low-resolution':
                image = image.resize((385, 490), Image.Resampling.BILINEAR).filter(ImageFilter.GaussianBlur(.35))
                randomizer = random.Random(1446)
                pixels = image.load()
                for _ in range(3500):
                    x, y = randomizer.randrange(image.width), randomizer.randrange(image.height)
                    value = randomizer.choice([70, 140, 210])
                    pixels[x, y] = (value, value, value)
            identifier = f'{language}-{case}'
            path = directory / f'{identifier}.png'
            image.save(path, optimize=False, dpi=(300, 300))
            pages.append({'id': identifier, 'language': language, 'path': path.name,
                          'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                          'width': image.width, 'height': image.height,
                          'text': '\n'.join(lines), 'critical': ['0012345678901', '18.11.2026'],
                          'cells': cells, 'unsupported': UNSUPPORTED})
    manifest = {'schema': 'fictional-ocr-fixtures/v1', 'pillow': __version__,
                'fontSha256': hashlib.sha256(font_path.read_bytes()).hexdigest(), 'pages': pages}
    (directory / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    return manifest
