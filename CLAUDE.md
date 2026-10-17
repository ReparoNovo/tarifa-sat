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
- `sw.js`, `manifest.webmanifest`, `icons/`: PWA. Iconos generados por la acción `.github/workflows/iconos.yml` desde el logo de reparonovo.com.

## Dónde hacer cada cambio
- **Funciones de la tarifa, fundas, tareas, garantías, textos, diseño** → en la página de Claude (plantilla), leyendo antes la versión publicada y fusionando (otras sesiones también la editan). Luego regenerar con `to_pages.py` y push. Si solo se cambia `index.html` aquí, la tarea de la mañana lo pisa.
- **Login, sincronización, PWA, iconos** → archivos de este repo (`boot.js`, `shim.js`, `sw.js`…).
- **Base de datos, permisos, buzón** → Supabase (migraciones con el conector).

## Conector SATTPV (nube, solo lectura)
- Edge Function `sattpv`: inicia sesión con los secretos `SATTPV_USUARIO`/`SATTPV_PASS` (cuenta común de la tienda) y manda el PIN del nivel de acceso "Claude" (`SATTPV_PIN`, solo permisos de ver) en la cabecera `X-Access-Level`. Solo GET y rutas de consulta. Token en `public.claves_srv` id `sattpv_token`.
- Desde SQL (tareas programadas con el conector Supabase): `select public.sattpv('/repairs?show=10&page=1');` → JSON {status, code, data}. Filtrar en SQL para no traer datos de más.
- Documentación de la API: https://app.sattpv.net/docs/ (base https://api-v3.sattpv.net).
- Cola de WhatsApp: colección `envios` (por_autorizar → cola → enviando → enviado/error), `public.envio_coger(equipo)` reparte entre ordenadores; panel en `envios.js`.

## Reglas
- Nunca subir la clave de cifrado ni la tarifa sin cifrar (`data` lleva costes de piezas de proveedores).
- Nunca subir datos de clientes al repo (es público).
