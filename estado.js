// Estado de actualizaciones: qué se ha actualizado, cuándo, y qué ha fallado.
// Lee public.docs coleccion 'registro' (lo escriben las tareas en la nube) y la fecha de la tarifa.
(function () {
  const sb = window.SB; if (!sb) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hora = ms => new Date(ms).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  const hace = ms => { const m = Math.round((Date.now() - ms) / 60000); return m < 60 ? `hace ${Math.max(m, 0)} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`; };
  const NOMBRE = { stock: 'Stock y precios de proveedores', proveedores: 'Precios de proveedores', tarifa: 'Tarifa (precios de venta)', resumen: 'Resumen de la jornada', fundas: 'Fundas pedidas', recogida: 'Equipos sin recoger', whatsapp: 'Envíos de WhatsApp', demanda: 'Demanda de teléfonos' };

  const css = document.createElement('style');
  css.textContent = `
  #rn-est{display:inline-flex;align-items:center;gap:6px;font:600 .8rem var(--body,system-ui);border:1px solid var(--line,#d9e0e3);background:var(--panel,#fff);color:var(--fg,#14232b);border-radius:999px;padding:5px 11px;cursor:pointer}
  #rn-est .pt{width:9px;height:9px;border-radius:50%;background:#9aa5ab}
  #rn-est.ok .pt{background:#1f8a4c} #rn-est.mal .pt{background:#c62828} #rn-est.viejo .pt{background:#e07b00}
  #rn-estbox{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.35);display:flex;align-items:flex-start;justify-content:center;padding:calc(20px + env(safe-area-inset-top,0px)) 12px 20px}
  #rn-estbox .pan{background:var(--panel,#fff);color:var(--fg,#14232b);border-radius:14px;max-width:720px;width:100%;max-height:calc(100vh - 40px);overflow:auto;padding:16px 18px;box-shadow:0 12px 40px rgba(0,0,0,.3)}
  #rn-estbox h2{font:700 1.25rem var(--display,system-ui);margin:0 0 10px;display:flex;justify-content:space-between;align-items:center}
  #rn-estbox h2 button{border:0;background:var(--soft,#e4f0f3);color:var(--accent,#0b6e8a);font:700 .95rem var(--body,system-ui);border-radius:8px;padding:6px 12px;cursor:pointer}
  #rn-estbox .res{display:grid;gap:8px;margin-bottom:14px}
  #rn-estbox .fila{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line,#d9e0e3);border-left:4px solid #9aa5ab;border-radius:10px;padding:8px 10px;background:var(--bg,#f3f5f6)}
  #rn-estbox .fila.ok{border-left-color:#1f8a4c} #rn-estbox .fila.mal{border-left-color:#c62828} #rn-estbox .fila.viejo{border-left-color:#e07b00}
  #rn-estbox .fila b{display:block} #rn-estbox .q{color:var(--muted,#5b6b73);font-size:.85rem}
  #rn-estbox h3{font:700 .8rem var(--display,system-ui);text-transform:uppercase;letter-spacing:.07em;color:var(--muted,#5b6b73);margin:12px 0 6px}
  #rn-estbox ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;font-size:.9rem}
  #rn-estbox li{padding:5px 0;border-bottom:1px solid var(--line,#d9e0e3)} #rn-estbox li:last-child{border-bottom:0}
  `;
  document.head.appendChild(css);

  const chip = document.createElement('button'); chip.type = 'button'; chip.id = 'rn-est'; chip.innerHTML = '<span class="pt"></span><span class="tx">Estado</span>';
  chip.title = 'Estado de las actualizaciones automáticas';
  (document.querySelector('header') || document.body).appendChild(chip);

  let reg = [];
  const meta = () => { try { return JSON.parse(document.getElementById('data').textContent).meta || {}; } catch (e) { return {}; } };
  const ultimo = p => reg.find(r => r.proceso === p);

  function resumen() {
    const m = meta(), filas = [];
    // Tarifa: la fecha va en los datos (la genera la tarea de la mañana)
    const ft = m.actualizado ? m.actualizado.split('/').reverse().join('-') : null;
    const diasT = ft ? Math.floor((Date.now() - new Date(ft + 'T12:00:00').getTime()) / 864e5) : 99;
    filas.push({ k: diasT <= 1 ? 'ok' : 'viejo', t: 'Tarifa (precios de venta y tiempos)', d: m.actualizado ? `Actualizada el ${m.actualizado}${diasT > 1 ? ` · lleva ${diasT} días sin actualizarse` : ''}` : 'Sin fecha' });
    const st = ultimo('stock');
    filas.push(st ? { k: !st.ok ? 'mal' : (Date.now() - st.fecha > 3 * 3600e3 ? 'viejo' : 'ok'), t: 'Stock de piezas, accesorios y precios de proveedores', d: `${hace(st.fecha)} (${hora(st.fecha)}) · ${st.texto}` } : { k: 'viejo', t: 'Stock y precios de proveedores', d: 'Todavía no hay registro.' });
    const pv = ultimo('proveedores');
    if (pv && !pv.ok && Date.now() - pv.fecha < 24 * 3600e3) filas.push({ k: 'mal', t: 'Proveedores', d: `${hace(pv.fecha)} · ${pv.texto}` });
    ['resumen', 'fundas', 'recogida', 'whatsapp', 'demanda'].forEach(p => { const r = ultimo(p); if (r) filas.push({ k: r.ok ? 'ok' : 'mal', t: NOMBRE[p], d: `${hace(r.fecha)} (${hora(r.fecha)}) · ${r.texto}` }); });
    return filas;
  }

  function pintaChip() {
    const f = resumen(); const mal = f.some(x => x.k === 'mal'), viejo = f.some(x => x.k === 'viejo');
    chip.className = mal ? 'mal' : viejo ? 'viejo' : 'ok';
    const st = ultimo('stock');
    chip.querySelector('.tx').textContent = mal ? 'Hay errores' : st ? 'Actualizado ' + new Date(st.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : 'Estado';
  }

  function abre() {
    const box = document.createElement('div'); box.id = 'rn-estbox';
    const f = resumen();
    box.innerHTML = `<div class="pan" role="dialog" aria-label="Estado de actualizaciones"><h2>Estado de actualizaciones <button type="button">Cerrar</button></h2>
      <div class="res">${f.map(x => `<div class="fila ${x.k}"><span>${x.k === 'ok' ? '✅' : x.k === 'mal' ? '❌' : '⚠️'}</span><span><b>${esc(x.t)}</b><span class="q">${esc(x.d)}</span></span></div>`).join('')}</div>
      <h3>Registro (últimos ${Math.min(reg.length, 60)})</h3>
      <ul>${reg.slice(0, 60).map(r => `<li>${r.ok ? '✅' : '❌'} <b>${esc(NOMBRE[r.proceso] || r.proceso)}</b> · <span class="q">${esc(hora(r.fecha))}</span><br>${esc(r.texto)}</li>`).join('') || '<li class="q">Sin registros todavía.</li>'}</ul>
      <p class="q">El stock y los precios de proveedores se actualizan solos en la nube cada 30 minutos (de 8:00 a 21:30, lunes a sábado) y por la noche. No hace falta tener ningún ordenador encendido.</p></div>`;
    box.addEventListener('click', e => { if (e.target === box || e.target.closest('h2 button')) box.remove(); });
    document.body.appendChild(box);
  }
  chip.addEventListener('click', abre);

  async function carga() {
    try {
      const { data } = await sb.from('docs').select('data').eq('coleccion', 'registro').order('updated_at', { ascending: false }).limit(120);
      reg = (data || []).map(x => x.data).filter(Boolean).sort((a, b) => b.fecha - a.fecha);
    } catch (e) {}
    pintaChip();
  }
  carga(); setInterval(carga, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') carga(); });
})();
