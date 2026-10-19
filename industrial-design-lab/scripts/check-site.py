from pathlib import Path
from urllib.parse import urlsplit, unquote
from lxml import html
import json

root = Path(__file__).resolve().parents[1]
errors = []
checked = 0
pages = list(root.rglob('*.html'))
for page in pages:
    doc = html.fromstring(page.read_text())
    label = str(page.relative_to(root))
    if len(doc.xpath('//h1')) != 1:
        errors.append(f'{label}: expected one h1')
    ids = doc.xpath('//*[@id]/@id')
    if len(ids) != len(set(ids)):
        errors.append(f'{label}: duplicate ids')
    if not doc.xpath('//html[@lang="ru"]'):
        errors.append(f'{label}: language missing')
    for node in doc.xpath('//*[@href or @src or @poster or @data-image]'):
        for attribute in ['href', 'src', 'poster', 'data-image']:
            value = node.get(attribute)
            if not value:
                continue
            url = urlsplit(value)
            if url.scheme or url.netloc:
                continue
            if value.startswith('/'):
                errors.append(f'{label}: root-absolute link incompatible with subfolder: {value}')
            target = (page.parent / unquote(url.path)).resolve() if url.path else page
            if target.is_dir():
                target /= 'index.html'
            if not target.exists():
                errors.append(f'{label}: missing {value}')
            elif url.fragment and target.suffix == '.html':
                if url.fragment not in html.fromstring(target.read_text()).xpath('//*[@id]/@id'):
                    errors.append(f'{label}: missing anchor {value}')
            checked += 1
    for image in doc.xpath('//img[not(@alt)]'):
        errors.append(f'{label}: image without alt')
    for field in doc.xpath('//form//input|//form//select|//form//textarea'):
        if not field.get('aria-label') and not doc.xpath('//label[@for=$id]', id=field.get('id')):
            errors.append(f'{label}: unlabeled field {field.get("id")}')
    for form in doc.xpath('//form'):
        if form.get('id') == 'brief-form' and not form.xpath('.//fieldset[@disabled]'):
            errors.append(f'{label}: form must fail closed without JavaScript')
    if doc.xpath('//link[contains(@href, "step3d-base.css")]'):
        errors.append(f'{label}: legacy CSS must not be loaded')
    if doc.xpath('//header//button[@class="menu-button"]/preceding-sibling::nav'):
        errors.append(f'{label}: mobile menu toggle must precede nav in tab order')
    for schema in doc.xpath('//script[@type="application/ld+json"]/text()'):
        try:
            json.loads(schema)
        except ValueError:
            errors.append(f'{label}: invalid structured data')
assert len(pages) == 24, f'Expected 24 pages; got {len(pages)}'
print(f'{len(pages)} pages; {checked} internal references; {len(errors)} errors')
for error in errors:
    print(error)
raise SystemExit(bool(errors))
