# Turns the preview's test output into README pictures in docs/images/ (SVG, so they stay sharp and animate).
# Usage: python3 design/preview/export.py <preview test output> <docs test output> <out dir>
import json, re, sys, os
prev, docs, out = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)
# Sample data only, and no real project names in public pictures.
NAMES = {'web-app': 'web-app', 'docs-site': 'docs-site', 'CodedLinesTracker': 'lines-tracker'}
def clean(s):
    for a, b in NAMES.items(): s = s.replace(a, b)
    return s
def svgs(n, acc):
    if isinstance(n, dict):
        if n.get('type') == 'Svg': acc.append(n['props'])
        for c in n.get('children') or []: svgs(c, acc)
        if n.get('type') == 'Box' and n.get('props', {}).get('backgroundColor') and 'bg' not in acc[0:0]: pass
    return acc
def bg(n):
    if isinstance(n, dict):
        c = (n.get('props') or {}).get('backgroundColor')
        if c: return c
        for k in n.get('children') or []:
            r = bg(k)
            if r: return r
    return None
def stack(parts, pad=12, fill=None):
    # Pane sections one under another, each kept as its own nested svg (its own styles).
    w = max(p['width'] for p in parts) + 2 * pad
    y, body = pad, ''
    for p in parts:
        inner = re.sub(r'^<svg ', f'<svg x="{pad}" y="{y}" ', p['source'])
        body += inner
        y += p['height'] + 12
    h = y - 12 + pad
    back = f'<rect width="{w}" height="{h}" rx="12" fill="{fill}"/>' if fill else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{back}{body}</svg>'
t = open(prev).read()
want = {'band-card-120col': 'band-card', 'band-card-busy': 'band-card-busy', 'band-arcade-120col': 'band-arcade',
        'band-compact-120col': 'band-compact', 'band-classic-120col': 'band-classic'}
for name, tree in re.findall(r'@@([\w-]+)@@(.*?)@@END@@', t, re.S):
    tree = json.loads(tree)
    parts = svgs(tree, [])
    if name in want and parts:
        open(f'{out}/{want[name]}.svg', 'w').write(clean(parts[0]['source']))
    if name == 'pane-none-48':
        open(f'{out}/pane.svg', 'w').write(clean(stack(parts)))
    if name == 'pane-night-40':
        open(f'{out}/pane-night.svg', 'w').write(clean(stack(parts, fill=bg(tree) or '#1F1E1D')))
for name, svg in re.findall(r'@@([\w-]+)@@(.*?)@@END@@', open(docs).read(), re.S):
    open(f'{out}/{name}.svg', 'w').write(svg)
print('\n'.join(sorted(os.listdir(out))))
