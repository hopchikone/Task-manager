"""Собирает автономную версию приложения в один HTML-файл (всё встроено)."""
import re, base64, pathlib

root = pathlib.Path(__file__).parent
html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'style.css').read_text(encoding='utf-8')
js = (root / 'app.js').read_text(encoding='utf-8')
manifest = (root / 'manifest.webmanifest').read_text(encoding='utf-8')
icon = base64.b64encode((root / 'icon-192.png').read_bytes()).decode()

html = html.replace('<link rel="stylesheet" href="style.css">', f'<style>\n{css}\n</style>')
icon_uri = f'data:image/png;base64,{icon}'
js = js.replace("const ICON_URL = 'icon-192.png';", f"const ICON_URL = '{icon_uri}';")
html = html.replace('<script src="app.js"></script>', f'<script>\n{js}\n</script>')
html = html.replace('<link rel="manifest" href="manifest.webmanifest">',
                    f'<link rel="manifest" href="data:application/manifest+json;base64,{base64.b64encode(manifest.encode()).decode()}">')
html = html.replace('<link rel="icon" href="icon-192.png">', f'<link rel="icon" href="data:image/png;base64,{icon}">')
html = html.replace('<link rel="apple-touch-icon" href="icon-192.png">', f'<link rel="apple-touch-icon" href="data:image/png;base64,{icon}">')

out = root.parent / 'Дневник-заданий.html'
out.write_text(html, encoding='utf-8')
print('OK ->', out, f'{out.stat().st_size/1024:.0f} КБ')
