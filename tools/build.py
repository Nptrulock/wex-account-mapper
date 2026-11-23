import pathlib, re, hashlib, json
root = pathlib.Path(__file__).resolve().parent.parent
src = root / 'src'
css = (src / 'app.css').read_text()
js = '\n'.join((src / f).read_text() for f in ['core.js', 'model.js', 'app.js', 'sf.js', 'app2.js'])
html = (src / 'shell.html').read_text().replace('/*__CSS__*/', css).replace('/*__JS__*/', js)
(root / 'index.html').write_text(html)
ver = hashlib.sha1((html + (src / 'sw.js').read_text()).encode()).hexdigest()[:10]
(root / 'sw.js').write_text((src / 'sw.js').read_text().replace('__VERSION__', ver))
print('built index.html', len(html), 'bytes; sw version', ver)
