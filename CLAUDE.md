# Tarifa SAT · Reparo Novo — cómo está montado

App interna (PWA) de la tienda Reparo Novo (Priego de Córdoba): tarifa de reparaciones, fundas, reservas, tareas, notas y garantías. La usan Miguel (dueño) y Lourdes (empleada) en móvil y ordenador. Todo en español.

## Piezas
- **GitHub Pages** (este repo, rama `main`, raíz) → https://reparonovo.github.io/tarifa-sat/
- **Supabase** proyecto `reparo-novo` (id `yxvwvyddyajjfcfxdjrb`, región París):
  - `public.docs (coleccion, id, data jsonb)`: colecciones `fundas`, `colocar`, `tareas`, `notas`, `reservas`, `garantias`, `sistema`. Realtime activado. RLS: solo cuentas en `public.permitidos`.
  - `public.doc_patch(c,i,p)`: merge de campos (lo usa `.doc(id).update()`).
  - `public.claves` (id `tarifa`): clave AES que descifra `data.enc`; solo la leen cuentas permitidas.
  - Registro bloqueado por trigger: solo se puede crear la cuenta `info@reparonovo.com`.
  - Edge Function `aviso` (buzón): las tareas programadas crean tareas/notas en la app con cabecera `x-clave` (valor en `public.claves_srv`, nunca en el repo).
- **Página de Claude** (artifact https://claude.ai/artifact/7iBLShqy3VJefdctrNcARy): es la PLANTILLA de la que sale la app. La tarea diaria «Actualizar tarifa SAT cada mañana» la regenera con precios nuevos y después ejecuta `tools/to_pages.py` y hace push aquí.

## Archivos
- `index.html` y `data.enc`: GENERADOS por `tools/to_pages.py <tarifa-sat.html> <clave>`. No editar a mano: se pisan cada mañana.
- `shim.js`: sustituye `claude.use('db'|'user')` del artifact por Supabase (misma forma: `collection().onSnapshot/add`, `doc(id).update/set/get`).
- `boot.js` / `boot.css`: login, comprobación de permiso, descifrado de la tarifa y arranque de la página. Oculta `#rn-aviso-app` (aviso que solo debe verse en la página de Claude).
- `config.js`: URL y clave publishable de Supabase (públicas por diseño).
- `consultor.js` + `consultor.enc`: consultor de precios de teléfonos y portátiles (J.J., Depau, Megasur), botón «💶 Consultor» en la cabecera. `consultor.enc` va cifrado con la misma clave que `data.enc`; se genera con `tools/consultor_enc.py datos.json <clave>` (datos.json fuera del repo; el parser y las fuentes están en el proyecto de Claude, `claude/tarifa-sat/consultor/`). Se actualiza los lunes, cuando Miguel pasa la tarifa de J.J.
- `sw.js`, `manifest.webmanifest`, `icons/`: PWA. Iconos generados por la acción `.github/workflows/iconos.yml` desde el logo de reparonovo.com.

## Dónde hacer cada cambio
- **Funciones de la tarifa, fundas, tareas, garantías, textos, diseño** → en la página de Claude (plantilla), leyendo antes la versión publicada y fusionando (otras sesiones también la editan). Luego regenerar con `to_pages.py` y push. Si solo se cambia `index.html` aquí, la tarea de la mañana lo pisa.
- **Login, sincronización, PWA, iconos** → archivos de este repo (`boot.js`, `shim.js`, `sw.js`…).
- **Base de datos, permisos, buzón** → Supabase (migraciones con el conector).

## Conector SATTPV (nube, solo lectura)
- Edge Function `sattpv`: inicia sesión con los secretos `SATTPV_USUARIO`/`SATTPV_PASS` (cuenta común de la tienda) y manda el PIN del nivel de acceso "Claude" (`SATTPV_PIN`, solo permisos de ver) en la cabecera `X-Access-Level`. Solo GET y rutas de consulta. Token en `public.claves_srv` id `sattpv_token`.
- Escritura limitada (autorizada por Miguel el 22/10/2026, solo cuando él lo pide, nunca en tareas automáticas): `select public.sattpv_producto('crear'|'actualizar', '{campos}'::jsonb, id);` → crea o actualiza productos (title, units, bought_price, sale_price, provider = id del proveedor, location = id de ubicación, barcode…). Nada de borrar ni tocar ventas, caja, clientes o reparaciones. Al crear, la ubicación no se guarda: hay que hacer después un 'actualizar' con location. También 'crear_concepto' ({title, price}; SATTPV da error 500) y 'mostrar_categoria' ({tpv, sat}, id de categoría: casillas Mostrar en TPV/SAT). Y 'add_serial' ({name, bought_price}, id del producto: añade un serial y suma 1 unidad; Miguel 27/10/2026). Nunca borrar serials.
- Desde SQL (tareas programadas con el conector Supabase): `select public.sattpv('/repairs?show=10&page=1');` → JSON {status, code, data}. Filtrar en SQL para no traer datos de más.
- Desde Chrome (tareas del iMac sin conector Supabase): pestaña en `https://reparonovo.github.io/…` y `fetch('https://yxvwvyddyajjfcfxdjrb.supabase.co/functions/v1/sattpv?p=' + encodeURIComponent(ruta), {headers: {'x-clave': …}})` (CORS abierto solo a reparonovo.github.io; la clave va en el prompt de la tarea, nunca en el repo). NO usar la web de SATTPV: su sesión se cierra y las tareas fallan.
- Documentación de la API: https://app.sattpv.net/docs/ (base https://api-v3.sattpv.net).
- Cola de WhatsApp: colección `envios` (por_autorizar → cola → enviando → enviado/error), `public.envio_coger(equipo)` reparte entre ordenadores; panel en `envios.js`.

## Reglas
- Nunca subir la clave de cifrado ni la tarifa sin cifrar (`data` lleva costes de piezas de proveedores).
- Nunca subir datos de clientes al repo (es público).
