"""Render fictional source + observed OCR boxes and literal results for human inspection."""
import argparse
import json
from pathlib import Path
import textwrap
from PIL import Image, ImageDraw, ImageFont
from benchmark import load_fixtures


def preview(fixtures, report_path, output):
    manifest = load_fixtures(fixtures)
    report = json.loads(report_path.read_text())
    if report.get('schema') != 'fictional-local-ocr-comparison/v1':
        raise ValueError('invalid_report')
    output.mkdir(parents=True, exist_ok=False)
    font_path = Path(__file__).resolve().parents[2] / 'apps/api/src/commercial-pdf/assets/DejaVuSans.ttf'
    font = ImageFont.truetype(str(font_path), 18)
    tiles = []
    for row in report['results']:
        if row['run'] != 1 or row['status'] != 'completed':
            continue
        page = next(p for p in manifest['pages'] if p['id'] == row['case'])
        image = Image.open(fixtures / page['path']).convert('RGB')
        draw = ImageDraw.Draw(image)
        for cell in page['cells']:
            x, y, w, h = cell['box']
            draw.rectangle((x, y, x + w, y + h), outline='green', width=3)
        for word in row['words']:
            x, y, w, h = word['box']
            draw.rectangle((x, y, x + w, y + h), outline='red', width=2)
        for table in row.get('automaticLayout', {}).get('tables', []):
            for cell in table['cells']:
                x, y, w, h = cell['box']
                draw.rectangle((x, y, x + w, y + h), outline='blue', width=2)
                draw.text((x + 3, y + 2), f"r{cell['row']} c{cell['column']} ({cell['rowSpan']}x{cell['columnSpan']})", font=font, fill='blue')
        image.thumbnail((700, 650))
        canvas = Image.new('RGB', (1000, 1000), 'white')
        canvas.paste(image, (10, 55))
        draw = ImageDraw.Draw(canvas)
        draw.text((10, 10), f"{row['engine']} / {row['case']} — OCR red; labels green; automatic grid blue", font=font, fill='black')
        label = f"CER {row['text']['edits']}/{row['text']['expected']}; critical {row['critical']['matched']}/{row['critical']['expected']}; cells {row['cells']['exact']}/{row['cells']['expected']}"
        draw.text((10, 725), label, font=font, fill='black')
        draw.multiline_text((10, 765), '\n'.join(textwrap.wrap('Observed: ' + row['observedText'], width=90)), font=font, fill='black', spacing=5)
        canvas.save(output / f"{row['engine']}-{row['case']}.png")
        tile = canvas.copy()
        tile.thumbnail((300, 300))
        tiles.append(tile)
    contact = Image.new('RGB', (1500, ((len(tiles) + 4) // 5) * 300), 'white')
    for i, tile in enumerate(tiles):
        contact.paste(tile, ((i % 5) * 300, (i // 5) * 300))
    contact.save(output / 'contact-sheet.png')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fixtures', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    options = parser.parse_args()
    preview(options.fixtures, options.report, options.output)
