#!/usr/bin/env python3
"""Convierte la página de la Tarifa SAT (versión artifact de Claude) en la app de GitHub Pages.

Uso:  python3 tools/to_pages.py tarifa-sat.html CLAVE_BASE64
Escribe index.html y data.enc en la raíz del repositorio.

- Los datos (tarifa, costes de piezas, agenda) se sacan del HTML, se comprimen y se cifran
  con AES-256-GCM: en el repositorio público solo queda el archivo cifrado. La clave la
  entrega Supabase solo a las cuentas permitidas, después de iniciar sesión.
- El código de la página se mantiene tal cual; se sustituye claude.use('db'/'user') por
  un adaptador a Supabase (shim.js) y se arranca después de descifrar los datos.
"""
import base64, gzip, json, os, re, sys, time
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main(src, clave_b64):
    h = open(src, encoding='utf-8').read()
    datos = {}
    for sid in ('data', 'agenda'):
        m = re.search(r'<script id="%s" type="application/json">(.*?)</script>' % sid, h, re.S)
        if not m:
            sys.exit('No encuentro el bloque %s' % sid)
        datos[sid] = json.loads(m.group(1))
        h = h[:m.start()] + '<script id="%s" type="application/json"></script>' % sid + h[m.end():]

    # Cifrar datos
    clave = base64.b64decode(clave_b64)
    iv = os.urandom(12)
    plano = gzip.compress(json.dumps(datos, ensure_ascii=False, separators=(',', ':')).encode('utf-8'), 9)
    ct = AESGCM(clave).encrypt(iv, plano, None)
    open(os.path.join(RAIZ, 'data.enc'), 'w').write(base64.b64encode(iv + ct).decode())

    # Los scripts de la página quedan en espera hasta que boot.js descifre los datos
    n = 0
    def diferir(m):
        nonlocal n
        n += 1
        return '<script type="text/x-diferido">'
    h = re.sub(r'<script>', diferir, h)
    if n == 0:
        sys.exit('No encuentro el script principal')

    ver = time.strftime('%Y%m%d%H%M')
    cab = f'''<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#0b6e8a">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Reparo Novo">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="icon" href="icons/icon-192.png">
<link rel="stylesheet" href="boot.css?v={ver}">
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>
<script src="config.js?v={ver}"></script>
<script src="shim.js?v={ver}"></script>
'''
    # Nombre de la app: «Reparo Novo» (título de la pestaña y cabecera), aunque la plantilla diga otra cosa
    h = re.sub(r'<title>.*?</title>', '<title>Reparo Novo</title>', h, count=1, flags=re.S)
    h = h.replace('<h1>Tarifa SAT · Reparo Novo</h1>', '<h1>Reparo Novo</h1>', 1)
    h = h.replace('</head>', cab + '</head>', 1)
    h = h.replace('</body>', f'<script src="boot.js?v={ver}"></script>\n</body>', 1) if '</body>' in h \
        else h + f'\n<script src="boot.js?v={ver}"></script>\n'
    h = h.replace('<html>', '<html lang="es">', 1)
    open(os.path.join(RAIZ, 'index.html'), 'w', encoding='utf-8').write(h)
    sw = open(os.path.join(RAIZ, 'sw.js'), encoding='utf-8').read()
    sw = re.sub(r"const VERSION = '[^']*'", f"const VERSION = '{ver}'", sw)
    open(os.path.join(RAIZ, 'sw.js'), 'w', encoding='utf-8').write(sw)
    print('OK', ver, 'index.html', len(h), 'data.enc', len(ct), 'scripts', n)


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
