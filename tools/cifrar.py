#!/usr/bin/env python3
"""Cifra un JSON con la clave de la app (mismo formato que data.enc) para que lo abra window.RN_ABRIR(archivo).

Uso: python3 tools/cifrar.py entrada.json salida.enc CLAVE_BASE64
Ej.: refs.json (buscador de referencias y facturas de Apokin, sale de la página de Claude) -> refs.enc
El JSON sin cifrar NUNCA va al repositorio (lleva costes de proveedor), ni la clave.
"""
import base64, gzip, json, os, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

if __name__ == '__main__':
    if len(sys.argv) < 4: sys.exit(__doc__)
    d = json.load(open(sys.argv[1], encoding='utf-8'))
    iv = os.urandom(12)
    plano = gzip.compress(json.dumps(d, ensure_ascii=False, separators=(',', ':')).encode('utf-8'), 9)
    ct = AESGCM(base64.b64decode(sys.argv[3])).encrypt(iv, plano, None)
    sal = sys.argv[2] if os.path.isabs(sys.argv[2]) else os.path.join(RAIZ, sys.argv[2])
    open(sal, 'w').write(base64.b64encode(iv + ct).decode())
    print('OK', os.path.basename(sal), len(ct), 'bytes')
