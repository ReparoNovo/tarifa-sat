"""Genera los iconos de la app a partir del logo de reparonovo.com (lo ejecuta GitHub Actions)."""
import io, sys, urllib.request
from PIL import Image
URLS = ["https://www.reparonovo.com/wp-content/uploads/2026/04/cropped-reparo.png",
        "https://www.reparonovo.com/wp-content/uploads/2026/04/cropped-reparo-270x270.png"]
src = None
for u in URLS:
    try:
        req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
        src = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=30).read())).convert("RGBA"); print("logo", u, src.size); break
    except Exception as e:
        print("fallo", u, e)
if src is None: sys.exit(1)
# recorta el borde transparente y centra sobre fondo blanco
bbox = src.getbbox(); src = src.crop(bbox) if bbox else src
def icono(size, margen, nombre):
    lado = int(size * (1 - 2 * margen)); im = src.copy(); im.thumbnail((lado, lado), Image.LANCZOS)
    fondo = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    fondo.alpha_composite(im, ((size - im.width) // 2, (size - im.height) // 2))
    fondo.convert("RGB").save("icons/" + nombre, optimize=True)
icono(192, 0.06, "icon-192.png"); icono(512, 0.06, "icon-512.png")
icono(512, 0.18, "icon-maskable-512.png"); icono(180, 0.06, "apple-touch-icon.png")
print("ok")
