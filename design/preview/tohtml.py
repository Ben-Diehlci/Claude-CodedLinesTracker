import json, re, sys, html
src, out = sys.argv[1], sys.argv[2]
t = open(src).read()
def el(n):
    if isinstance(n, str): return html.escape(n)
    if n is None or n is False: return ''
    ty = n.get('type'); p = n.get('props', {}) or {}
    kids = ''.join(el(c) for c in (n.get('children') or []))
    if ty == 'Box':
        st = 'display:flex;flex-direction:%s;' % p.get('flexDirection','row')
        if p.get('alignItems'): st += 'align-items:%s;' % {'center':'center'}.get(p['alignItems'], p['alignItems'])
        if p.get('flexWrap'): st += 'flex-wrap:wrap;'
        if p.get('columnGap'): st += 'column-gap:%dch;' % p['columnGap']
        for k, css in [('paddingX','padding-left:%dch;padding-right:%dch;'), ('marginLeft','margin-left:%dch;%s'), ('marginBottom','margin-bottom:%dem;%s')]:
            if p.get(k):
                st += css % (p[k], p[k]) if css.count('%d') == 2 else (css.replace('%s','') % p[k])
        return f'<div style="{st}">{kids}</div>'
    if ty == 'Text':
        st = ''
        if p.get('color'): st += 'color:%s;' % p['color']
        if p.get('bold'): st += 'font-weight:700;'
        if p.get('dimColor'): st += 'opacity:.6;'
        return f'<span style="{st}white-space:pre">{kids}</span>'
    if ty == 'Svg':
        return f'<span style="display:inline-block;width:{p.get("width","auto")}px">{p["source"]}</span>'
    if ty == 'Button': return f'<button>{html.escape(p.get("label",""))}</button>'
    if ty == 'Select': return f'<label>{html.escape(p.get("label",""))} <select><option>{html.escape(str(p.get("value")))}</option></select></label>'
    return f'<span>[{ty}]</span>{kids}'
page = '<!doctype html><meta charset=utf-8><body style="margin:0;background:#262624;color:#F5F4EE;font:14px/1.45 -apple-system,system-ui,sans-serif;padding:16px">'
for m in re.finditer(r'@@([\w-]+)@@(.*?)@@END@@', t, re.S):
    name, tree = m.group(1), json.loads(m.group(2))
    w = '340px' if name == 'pane' else '980px'
    page += f'<div style="font-size:11px;color:#9C9A92;margin:14px 0 4px">{name}</div><div style="width:{w};background:#262624;border:1px dashed #555;padding:8px">{el(tree)}</div>'
open(out, 'w').write(page)
