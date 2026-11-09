"""Check local HTML links/assets without a browser or external dependencies."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import re

ROOT = Path(__file__).resolve().parent.parent


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.path = path
        self.ids = set()
        self.links = []
        self.errors = []
        self.lang = False
        self.viewport = False
        self.feed(path.read_text())

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if attrs.get('id'):
            if attrs['id'] in self.ids:
                self.errors.append(f"duplicate id: {attrs['id']}")
            self.ids.add(attrs['id'])
        if tag == 'html':
            self.lang = bool(attrs.get('lang'))
        if tag == 'meta' and attrs.get('name') == 'viewport':
            self.viewport = True
        if tag == 'button' and attrs.get('type') not in ('button', 'submit', 'reset'):
            self.errors.append('button is missing an explicit type')
        for key in ('href', 'src'):
            if attrs.get(key):
                self.links.append(attrs[key])
        if tag == 'canvas' and not attrs.get('aria-label'):
            self.errors.append('canvas is missing an accessible label')

    handle_startendtag = handle_starttag


paths = [*sorted(ROOT.glob('*.html')), *sorted((ROOT / 'games').glob('*.html'))]
pages = {path.resolve(): Page(path) for path in paths}
errors = []
for path, page in pages.items():
    label = path.relative_to(ROOT)
    errors.extend(f'{label}: {error}' for error in page.errors)
    if not page.lang or not page.viewport:
        errors.append(f'{label}: missing language or responsive viewport')
    for link in page.links:
        url = urlsplit(link)
        if url.scheme or url.netloc:
            continue
        target = (path.parent / unquote(url.path)).resolve() if url.path else path
        if not target.is_relative_to(ROOT) or not target.is_file():
            errors.append(f'{label}: missing local resource {link}')
        elif url.fragment and target in pages and unquote(url.fragment) not in pages[target].ids:
            errors.append(f'{label}: missing anchor {link}')

for path in ROOT.rglob('*.css'):
    if '.qa' in path.parts:
        continue
    for url in re.findall(r'url\([\'"]?([^\)\'\"]+)', path.read_text()):
        parsed = urlsplit(url)
        if not parsed.scheme and not parsed.netloc and not (path.parent / unquote(parsed.path)).is_file():
            errors.append(f'{path.relative_to(ROOT)}: missing CSS asset {url}')

if errors:
    raise SystemExit('\n'.join(errors))
print(f'Checked {len(pages)} HTML pages: local links, anchors, assets, IDs, button types, and canvas labels pass.')
