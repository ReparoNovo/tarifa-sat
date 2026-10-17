// Cola de WhatsApp (solo en la app). Colección 'envios' en Supabase:
// {telefono, nombre, texto, estado: por_autorizar|cola|enviando|enviado|error|anulado, creado, origen, ref, revisar_chat, por, enviado_at, error, autorizado_por}
// - Los botones de WhatsApp de la página preguntan: «Enviar yo ahora» o «Que lo envíe Claude» (va directo a la cola).
// - Lo que detectan las tareas automáticas entra como «por autorizar»: aquí se autoriza, se edita o se descarta.
// - Cualquier ordenador con Claude, Chrome y WhatsApp Web encendido envía la cola (tarea programada).
(async function () {
  const db = await window.claude.use('db');
  const col = db.collection('envios');
  let envios = [];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const yo = () => (window.RN_USER && (window.RN_USER.nombre || window.RN_USER.email)) || 'app';
  const hora = ms => ms ? new Date(ms).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  const css = document.createElement('style');
  css.textContent = `
#wa-banner{margin-top:10px;background:#1f8a4c;color:#fff;border-radius:10px;padding:10px 14px;font-weight:600;cursor:pointer;display:flex;justify-content:space-between;gap:10px;align-items:center}
#wa-banner[hidden]{display:none}
#wa-fab{position:fixed;right:14px;bottom:calc(96px + env(safe-area-inset-bottom,0px));z-index:40;border:0;border-radius:999px;background:#1f8a4c;color:#fff;font:700 .9rem var(--body,system-ui);padding:10px 14px;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer}
@media (min-width:721px){#wa-fab{bottom:18px}}
@media (min-width:1100px){header #wa-fab{position:static;box-shadow:none;order:3;margin-left:12px}}
#wa-fab .n{background:#fff;color:#1f8a4c;border-radius:999px;padding:0 7px;margin-left:6px}
#wa-fab .n:empty{display:none}
#wa-pan{position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center}
#wa-pan[hidden]{display:none}
#wa-pan .box{background:var(--panel,#fff);color:var(--fg,#14232b);width:100%;max-width:640px;max-height:88vh;overflow:auto;border-radius:16px 16px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px))}
@media (min-width:721px){#wa-pan{align-items:center}#wa-pan .box{border-radius:16px}}
#wa-pan h2{font:700 1.3rem var(--display,system-ui);margin:0 0 4px;display:flex;justify-content:space-between;align-items:center}
#wa-pan h3{font:700 .8rem var(--display,system-ui);text-transform:uppercase;letter-spacing:.07em;color:var(--muted,#5b6b73);margin:16px 0 6px}
#wa-pan .it{border:1px solid var(--line,#d9e0e3);border-left:4px solid #1f8a4c;border-radius:10px;padding:10px 12px;margin-bottom:8px;background:var(--bg,#f3f5f6)}
#wa-pan .it.aut{border-left-color:#e07b00}
#wa-pan .it.err{border-left-color:#c62828}
#wa-pan .it .q{color:var(--muted,#5b6b73);font-size:.85rem}
#wa-pan .it .tx{white-space:pre-wrap;font-size:.92rem;margin:6px 0}
#wa-pan textarea{width:100%;font:500 .95rem var(--body,system-ui);padding:8px 10px;border:1px solid var(--line,#d9e0e3);border-radius:8px;background:var(--panel,#fff);color:var(--fg,#14232b);min-height:7em}
#wa-pan .bt{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
#wa-pan button{font:600 .88rem var(--body,system-ui);padding:8px 12px;border:1px solid var(--line,#d9e0e3);border-radius:8px;background:var(--panel,#fff);color:var(--fg,#14232b);cursor:pointer}
#wa-pan button.ok{background:#1f8a4c;border-color:#1f8a4c;color:#fff}
#wa-pan .vacio{color:var(--muted,#5b6b73);font-size:.9rem}
#wa-pan .x{border:0;background:none;font-size:1.6rem;line-height:1;padding:4px 8px}`;
  document.head.appendChild(css);

  const banner = document.createElement('div'); banner.id = 'wa-banner'; banner.hidden = true; banner.setAttribute('role', 'button'); banner.tabIndex = 0;
  const nb = document.getElementById('n-banner') || document.querySelector('.search');
  nb && nb.parentNode.insertBefore(banner, nb.nextSibling);
  const fab = document.createElement('button'); fab.id = 'wa-fab'; fab.type = 'button'; fab.innerHTML = '📲 WhatsApp<span class="n"></span>';
  (document.querySelector('header') || document.body).appendChild(fab);
  const pan = document.createElement('div'); pan.id = 'wa-pan'; pan.hidden = true; pan.innerHTML = '<div class="box" role="dialog" aria-label="Mensajes de WhatsApp"></div>';
  document.body.appendChild(pan);
  const box = pan.querySelector('.box');
  let modo = null;      // {tipo:'nuevo', telefono, texto, href} o null
  let editando = null;  // id en edición

  const abrir = () => { pan.hidden = false; pinta(); };
  const cerrar = () => { pan.hidden = true; modo = null; editando = null; };
  fab.onclick = abrir; banner.onclick = abrir; banner.onkeydown = e => { if (e.key === 'Enter') abrir(); };
  pan.addEventListener('click', e => { if (e.target === pan) cerrar(); });

  function item(e, acciones) {
    const d = e;
    const cls = d.estado === 'por_autorizar' ? 'it aut' : (d.estado === 'error' ? 'it err' : 'it');
    const est = { por_autorizar: 'Por autorizar', cola: 'En cola: lo enviará el primer ordenador libre', enviando: 'Enviándose (' + esc(d.por || '') + ')', enviado: 'Enviado ' + hora(d.enviado_at) + (d.por ? ' desde ' + esc(d.por) : ''), error: 'No enviado: ' + esc(d.error || ''), anulado: 'Descartado' }[d.estado] || esc(d.estado);
    const cuerpo = editando === d._id
      ? `<textarea data-wtx="${esc(d._id)}">${esc(d.texto)}</textarea>`
      : `<div class="tx">${esc(d.texto)}</div>`;
    return `<div class="${cls}"><b>${esc(d.nombre || 'Cliente')}</b> · ${esc(d.telefono)} <span class="q">${d.origen ? '· ' + esc(d.origen) : ''}</span>
      <div class="q">${est}</div>${cuerpo}<div class="bt">${acciones}</div></div>`;
  }

  function pinta() {
    const n = envios.filter(e => e.estado === 'por_autorizar').length;
    fab.querySelector('.n').textContent = n || '';
    banner.hidden = !n;
    banner.innerHTML = `<span>📲 ${n} ${n === 1 ? 'mensaje' : 'mensajes'} de WhatsApp por autorizar</span><span>Revisar ›</span>`;
    if (pan.hidden) return;
    const por = envios.filter(e => e.estado === 'por_autorizar');
    const cola = envios.filter(e => e.estado === 'cola' || e.estado === 'enviando');
    const err = envios.filter(e => e.estado === 'error');
    const hace = Date.now() - 3 * 86400000;
    const env = envios.filter(e => e.estado === 'enviado' && (e.enviado_at || 0) > hace).sort((a, b) => (b.enviado_at || 0) - (a.enviado_at || 0)).slice(0, 15);
    let h = `<h2>Mensajes de WhatsApp <button class="x" type="button" data-wcerrar aria-label="Cerrar">×</button></h2>
      <p class="q">Los envía Claude desde cualquier ordenador de la tienda que esté encendido con WhatsApp Web abierto (cada hora con la tienda abierta).</p>`;
    if (modo) {
      h += `<h3>Nuevo mensaje</h3><div class="it"><b>${esc(modo.telefono)}</b><textarea id="wa-nuevo">${esc(modo.texto)}</textarea>
        <div class="bt"><button class="ok" type="button" data-wcola>Que lo envíe Claude</button><button type="button" data-wyo>Enviarlo yo ahora</button><button type="button" data-wcancel>Cancelar</button></div></div>`;
    }
    h += `<h3>Por autorizar (${por.length})</h3>` + (por.length ? por.map(e => item(e, editando === e._id
      ? `<button class="ok" type="button" data-wguardaok="${esc(e._id)}">Guardar y autorizar</button><button type="button" data-wnoedit>Cancelar</button>`
      : `<button class="ok" type="button" data-wok="${esc(e._id)}">Autorizar envío</button><button type="button" data-wedit="${esc(e._id)}">Editar</button><button type="button" data-wno="${esc(e._id)}">Descartar</button>`)).join('') : '<p class="vacio">Nada pendiente.</p>');
    h += `<h3>En cola (${cola.length})</h3>` + (cola.length ? cola.map(e => item(e, e.estado === 'cola' ? `<button type="button" data-wno="${esc(e._id)}">Quitar de la cola</button>` : '')).join('') : '<p class="vacio">Vacía.</p>');
    if (err.length) h += `<h3>No enviados (${err.length})</h3>` + err.map(e => item(e, `<button class="ok" type="button" data-wok="${esc(e._id)}">Reintentar</button><a class="afinar" target="_blank" rel="noopener" href="https://api.whatsapp.com/send?phone=34${esc(e.telefono)}&text=${encodeURIComponent(e.texto)}" data-wmano="${esc(e._id)}">Enviarlo yo</a><button type="button" data-wno="${esc(e._id)}">Descartar</button>`)).join('');
    h += `<h3>Enviados (últimos 3 días)</h3>` + (env.length ? env.map(e => item(e, '')).join('') : '<p class="vacio">Ninguno.</p>');
    box.innerHTML = h;
  }

  async function upd(id, p) { try { await col.doc(id).update(p); } catch (x) { alert('No se pudo guardar: ' + x.message); } }

  box.addEventListener('click', async e => {
    const b = e.target.closest('[data-wcerrar],[data-wcola],[data-wyo],[data-wcancel],[data-wok],[data-wno],[data-wedit],[data-wnoedit],[data-wguardaok],[data-wmano]');
    if (!b) return;
    if (b.dataset.wcerrar !== undefined) return cerrar();
    if (b.dataset.wcancel !== undefined) { modo = null; return pinta(); }
    if (b.dataset.wyo !== undefined) { const t = document.getElementById('wa-nuevo').value; window.open('https://api.whatsapp.com/send?phone=' + modo.tel + '&text=' + encodeURIComponent(t), '_blank'); modo = null; return cerrar(); }
    if (b.dataset.wcola !== undefined) {
      const t = document.getElementById('wa-nuevo').value.trim(); if (!t) return;
      try { await col.add({ telefono: modo.telefono, nombre: modo.nombre || '', texto: t, estado: 'cola', creado: Date.now(), origen: 'apuntado en la app', autorizado_por: yo(), revisar_chat: false }); modo = null; pinta(); }
      catch (x) { alert('No se pudo poner en la cola: ' + x.message); }
      return;
    }
    if (b.dataset.wok) return upd(b.dataset.wok, { estado: 'cola', autorizado_por: yo(), autorizado_at: Date.now(), error: '' });
    if (b.dataset.wno) return upd(b.dataset.wno, { estado: 'anulado', anulado_at: Date.now() });
    if (b.dataset.wedit) { editando = b.dataset.wedit; return pinta(); }
    if (b.dataset.wnoedit !== undefined) { editando = null; return pinta(); }
    if (b.dataset.wguardaok) { const ta = box.querySelector(`[data-wtx="${CSS.escape(b.dataset.wguardaok)}"]`); const id = b.dataset.wguardaok; editando = null; return upd(id, { texto: ta.value.trim(), estado: 'cola', autorizado_por: yo(), autorizado_at: Date.now() }); }
    if (b.dataset.wmano) setTimeout(() => upd(b.dataset.wmano, { estado: 'enviado', enviado_at: Date.now(), por: 'a mano (' + yo() + ')' }), 300);
  });

  // Botones de WhatsApp a clientes de la página: preguntar si lo envía Claude o la persona.
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href*="api.whatsapp.com/send"],a[href*="wa.me/"]');
    if (!a || a.closest('#wa-pan')) return;
    let u; try { u = new URL(a.href); } catch (x) { return; }
    let tel = u.searchParams.get('phone') || (u.hostname === 'wa.me' ? u.pathname.slice(1) : '');
    tel = (tel || '').replace(/\D/g, '');
    if (!tel) return;                       // sin número (elegir chat): se abre WhatsApp como siempre
    e.preventDefault();
    const nueve = tel.startsWith('34') ? tel.slice(2) : tel;
    modo = { tel, telefono: nueve, texto: u.searchParams.get('text') || '' };
    abrir();
  }, true);

  col.onSnapshot(s => { envios = s.docs.map(d => ({ ...d.data(), _id: d.id })); pinta(); }, err => console.error(err));
})();
