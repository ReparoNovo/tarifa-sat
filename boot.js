// Arranque: iniciar sesión → comprobar permiso → descifrar la tarifa → arrancar la página.
(function () {
  const sb = window.SB;
  const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
               set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
               del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
  let arrancado = false;

  const caja = document.createElement('div');
  caja.id = 'rn-login';
  document.body.appendChild(caja);
  document.body.classList.add('rn-bloq');

  // En el iPhone, al abrir o reanudar la app con mala cobertura, las llamadas a Supabase pueden quedarse colgadas
  // y la pantalla se quedaba en blanco: todas llevan tiempo máximo y, si no responde, se usa lo último guardado.
  const conTiempo = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('tiempo de espera')), ms))]);

  function pinta(html) { caja.innerHTML = '<div class="rn-panel"><h1>Reparo Novo</h1>' + html + '</div>'; caja.hidden = false; }
  function msg(t, err) { const p = caja.querySelector('.rn-msg'); if (p) { p.textContent = t; p.classList.toggle('rn-err', !!err); } }

  function formLogin(modo) {
    const crear = modo === 'crear';
    pinta(`<p class="rn-sub">${crear ? 'Solo para la cuenta de la tienda (info@reparonovo.com), la primera vez.' : 'Inicia sesión para ver la tarifa y lo apuntado.'}</p>
      <form id="rn-f" autocomplete="on">
        <label>Correo<input name="email" type="email" required autocomplete="username" inputmode="email"></label>
        <label>Contraseña<input name="pass" type="password" required minlength="8" autocomplete="${crear ? 'new-password' : 'current-password'}"></label>
        <button type="submit" class="rn-btn">${crear ? 'Crear cuenta' : 'Entrar'}</button>
      </form>
      <p class="rn-msg" aria-live="polite"></p>
      <p class="rn-links">${crear ? '<a href="#" data-m="entrar">Ya tengo cuenta</a>' : '<a href="#" data-m="olvido">He olvidado la contraseña</a> · <a href="#" data-m="crear">Activar la cuenta de la tienda</a>'}</p>`);
    caja.querySelector('#rn-f').onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target); const email = String(f.get('email')).trim().toLowerCase(); const password = String(f.get('pass'));
      msg(crear ? 'Creando cuenta…' : 'Entrando…');
      if (crear) {
        if (email !== 'info@reparonovo.com') return msg('Solo se puede crear la cuenta de la tienda (info@reparonovo.com).', true);
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
        if (error) return msg(traduce(error), true);
        if (!data.session) return msg('Te hemos mandado un correo para confirmar la cuenta. Ábrelo, pulsa el enlace y vuelve aquí para entrar.');
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) return msg(traduce(error), true);
      }
      comprobar();
    };
  }

  function formOlvido() {
    pinta(`<p class="rn-sub">Te mandamos un correo para poner una contraseña nueva.</p>
      <form id="rn-f"><label>Correo<input name="email" type="email" required autocomplete="username"></label>
      <button type="submit" class="rn-btn">Enviar correo</button></form>
      <p class="rn-msg" aria-live="polite"></p><p class="rn-links"><a href="#" data-m="entrar">Volver</a></p>`);
    caja.querySelector('#rn-f').onsubmit = async e => {
      e.preventDefault();
      const email = String(new FormData(e.target).get('email')).trim().toLowerCase();
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      msg(error ? traduce(error) : 'Hecho. Mira tu correo (y la carpeta de spam).', !!error);
    };
  }

  function formNueva() {
    pinta(`<p class="rn-sub">Escribe tu contraseña nueva.</p>
      <form id="rn-f"><label>Contraseña nueva<input name="pass" type="password" required minlength="8" autocomplete="new-password"></label>
      <button type="submit" class="rn-btn">Guardar</button></form><p class="rn-msg" aria-live="polite"></p>`);
    caja.querySelector('#rn-f').onsubmit = async e => {
      e.preventDefault();
      const { error } = await sb.auth.updateUser({ password: String(new FormData(e.target).get('pass')) });
      if (error) return msg(traduce(error), true);
      comprobar();
    };
  }

  caja.addEventListener('click', e => {
    const a = e.target.closest('a[data-m]'); if (!a) return; e.preventDefault();
    ({ entrar: () => formLogin('entrar'), crear: () => formLogin('crear'), olvido: formOlvido })[a.dataset.m]();
  });

  function traduce(e) {
    const m = (e && e.message || '').toLowerCase();
    if (m.includes('invalid login')) return 'Correo o contraseña incorrectos.';
    if (m.includes('email not confirmed')) return 'Falta confirmar la cuenta: abre el correo que te llegó y pulsa el enlace.';
    if (m.includes('database error') || m.includes('registro no permitido')) return 'Solo se puede crear la cuenta de la tienda (info@reparonovo.com).';
    if (m.includes('already registered')) return 'Ese correo ya tiene cuenta. Pulsa «Ya tengo cuenta».';
    if (m.includes('password')) return 'La contraseña debe tener al menos 8 caracteres.';
    if (m.includes('rate')) return 'Demasiados intentos. Espera unos minutos.';
    if (m.includes('fetch') || m.includes('network')) return 'Sin conexión. Revisa el wifi o los datos.';
    return e.message || 'Algo ha fallado.';
  }

  async function comprobar() {
    pinta('<p class="rn-sub">Abriendo…</p>');
    let session = null;
    try { ({ data: { session } } = await conTiempo(sb.auth.getSession(), 8000)); }
    catch (e) {
      // Sin respuesta (cobertura): si ya se entró antes en este móvil, se abre con lo guardado
      const cuenta = LS.get('rn_ok');
      if (cuenta && LS.get('rn_clave')) { window.RN_USER = { email: cuenta, nombre: '' }; return arrancar(); }
      pinta(`<p class="rn-sub rn-err">No hay conexión con el servidor.</p><button type="button" class="rn-btn" id="rn-re">Reintentar</button>`);
      caja.querySelector('#rn-re').onclick = () => location.reload();
      return;
    }
    if (!session) {
      if (LS.get('rn_cuenta')) formLogin('entrar'); else formLogin('entrar');
      return;
    }
    const email = (session.user.email || '').toLowerCase();
    let perm = null;
    try {
      const { data, error } = await conTiempo(sb.from('permitidos').select('email,nombre').eq('email', email).maybeSingle(), 7000);
      if (error) throw error;
      perm = data;
      if (perm) LS.set('rn_ok', email); else LS.del('rn_ok');
    } catch (e) {
      if (LS.get('rn_ok') === email) perm = { email, nombre: '' };   // sin conexión: se confía en la última comprobación
    }
    if (!perm) {
      pinta(`<p class="rn-sub">Has entrado como <b>${esc(email)}</b>, pero esta cuenta todavía no está activada.</p>
        <p>Pide a Miguel que la active y vuelve a abrir la app.</p>
        <button type="button" class="rn-btn" id="rn-re">Comprobar otra vez</button>
        <p class="rn-links"><a href="#" id="rn-out">Salir y entrar con otro correo</a></p>`);
      caja.querySelector('#rn-re').onclick = comprobar;
      caja.querySelector('#rn-out').onclick = async e => { e.preventDefault(); await sb.auth.signOut(); formLogin('entrar'); };
      return;
    }
    window.RN_USER = { email, nombre: perm.nombre || '' };
    LS.set('rn_cuenta', email);
    arrancar();
  }

  async function clave() {
    let k = LS.get('rn_clave');
    try {
      const { data, error } = await conTiempo(sb.from('claves').select('valor').eq('id', 'tarifa').maybeSingle(), 7000);
      if (!error && data) { k = data.valor; LS.set('rn_clave', k); }
    } catch (e) {}
    if (!k) throw new Error('No se pudo obtener la clave de la tarifa');
    return k;
  }

  async function descifrar(k, archivo) {
    const r = await fetch(archivo || 'data.enc', { cache: 'no-cache' });
    if (!r.ok) throw new Error('No se pudo descargar la tarifa');
    const raw = Uint8Array.from(atob((await r.text()).trim()), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', Uint8Array.from(atob(k), c => c.charCodeAt(0)), 'AES-GCM', false, ['decrypt']);
    const plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12));
    const txt = await new Response(new Blob([plano]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    return JSON.parse(txt);
  }

  // Stock de piezas, accesorios con stock y costes de proveedores "en vivo": los calcula cada 30 min la
  // Edge Function tarifa_vivo (nube, sin iMac) y se aplican encima de la tarifa cifrada.
  async function enVivo(d) {
    let v = null;
    try {
      const { data } = await sb.from('docs').select('data').eq('coleccion', 'sistema').eq('id', 'tarifa_vivo').maybeSingle();
      v = data && data.data;
      if (v) LS.set('rn_vivo', JSON.stringify(v));
    } catch (e) { try { v = JSON.parse(LS.get('rn_vivo') || 'null'); } catch (_) {} }
    if (!v || !v.fecha || Date.now() - v.fecha > 4 * 864e5) return;
    const D = d.data;
    try {
      (D.modelos || []).forEach(m => (m.items || []).forEach(it => { it.sat = (v.sat && v.sat[m.m + '|' + it.r]) || 0; }));
      if (v.piezas && Array.isArray(D.piezas)) D.piezas.forEach(x => { const p = v.piezas[x[3] + '|' + x[0] + '|' + x[2]]; if (p) { x[4] = p[0]; x[5] = p[1]; } });
      if (Array.isArray(v.acc) && v.acc.length > 50) D.acc = v.acc;
      D.meta = Object.assign({}, D.meta, { vivo: v.fecha });
    } catch (e) {}
  }

  async function arrancar() {
    if (arrancado) return;
    pinta('<p class="rn-sub">Cargando la tarifa…</p>');
    let d;
    try { d = await descifrar(await clave()); }
    catch (e) {
      LS.del('rn_clave');
      pinta(`<p class="rn-sub rn-err">No se ha podido abrir la tarifa (${esc(e.message)}).</p><button type="button" class="rn-btn" id="rn-re">Reintentar</button>`);
      caja.querySelector('#rn-re').onclick = () => location.reload();
      return;
    }
    arrancado = true;
    // Para otros módulos de la app (consultor de precios): abre otro archivo cifrado con la misma clave
    window.RN_ABRIR = async archivo => descifrar(await clave(), archivo);
    await enVivo(d);
    document.getElementById('data').textContent = JSON.stringify(d.data);
    document.getElementById('agenda').textContent = JSON.stringify(d.agenda);
    document.querySelectorAll('script[type="text/x-diferido"]').forEach(s => {
      const n = document.createElement('script'); n.textContent = s.textContent; s.replaceWith(n);
    });
    const ver = (document.querySelector('script[src^="boot.js"]')?.src.split('v=')[1] || '1');
    const ev = document.createElement('script'); ev.src = 'envios.js?v=' + ver; document.body.appendChild(ev);
    const es = document.createElement('script'); es.src = 'estado.js?v=' + ver; document.body.appendChild(es);
    const co = document.createElement('script'); co.src = 'consultor.js?v=' + ver; document.body.appendChild(co);
    caja.hidden = true; caja.innerHTML = '';
    document.body.classList.remove('rn-bloq');
    pie();
  }

  function pie() {
    const w = document.querySelector('.wrap') || document.body;
    const p = document.createElement('p'); p.className = 'foot rn-pie';
    p.innerHTML = `Sesión: <b>${esc(RN_USER.email)}</b> · <a href="#" id="rn-salir">Cerrar sesión</a>`;
    w.appendChild(p);
    p.querySelector('#rn-salir').onclick = async e => { e.preventDefault(); if (!confirmar()) return; await sb.auth.signOut(); LS.del('rn_clave'); LS.del('rn_ok'); location.reload(); };
  }
  function confirmar() { return true; }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  setTimeout(() => {
    if (arrancado || caja.querySelector('form') || caja.querySelector('#rn-re')) return;
    pinta(`<p class="rn-sub">Está tardando más de la cuenta (puede ser la cobertura).</p><button type="button" class="rn-btn" id="rn-re">Reintentar</button>`);
    caja.querySelector('#rn-re').onclick = () => location.reload();
  }, 25000);

  sb.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') formNueva(); });
  if (/type=recovery/.test(location.hash)) { /* lo gestiona onAuthStateChange */ }
  else comprobar();

  // Actualización automática: al volver a la app (el iPhone la "reanuda" sin recargar) se busca versión nueva;
  // si la hay, el service worker nuevo toma el control y la página se recarga sola (salvo si se está escribiendo).
  if ('serviceWorker' in navigator) {
    const habia = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
      const mira = () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); };
      document.addEventListener('visibilitychange', mira);
      window.addEventListener('focus', mira);
      setInterval(mira, 5 * 60 * 1000);
    }).catch(() => {});
    let recargando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!habia || recargando) return;
      const recarga = () => { if (recargando) return; const a = document.activeElement; if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return; recargando = true; location.reload(); };
      recarga();
      if (!recargando) document.addEventListener('focusout', () => setTimeout(recarga, 300));
    });
  }
})();
