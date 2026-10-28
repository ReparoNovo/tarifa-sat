#!/usr/bin/env python3
"""Cifra los datos del consultor de precios (teléfonos y portátiles de J.J., Depau y Megasur) en consultor.enc.

Uso: python3 tools/consultor_enc.py datos.json CLAVE_BASE64
datos.json = {"prov": {"jj": {"nombre": "J.J.", "fecha": "AAAA-MM-DD", "items": [...]}, "megasur": {...}, "depau": {...}}}
Mismo cifrado que data.enc (AES-256-GCM sobre JSON comprimido). La clave NUNCA va al repositorio, y datos.json
(costes de proveedores sin cifrar) tampoco: se genera fuera del repo.
"""
import base64, gzip, json, os, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

if __name__ == '__main__':
    if len(sys.argv) < 3: sys.exit(__doc__)
    d = json.load(open(sys.argv[1], encoding='utf-8'))
    iv = os.urandom(12)
    plano = gzip.compress(json.dumps(d, ensure_ascii=False, separators=(',', ':')).encode('utf-8'), 9)
    ct = AESGCM(base64.b64decode(sys.argv[2])).encrypt(iv, plano, None)
    open(os.path.join(RAIZ, 'consultor.enc'), 'w').write(base64.b64encode(iv + ct).decode())
    n = sum(len(p.get('items', [])) for p in d.get('prov', {}).values())
    print('OK consultor.enc', n, 'equipos', len(ct), 'bytes')
