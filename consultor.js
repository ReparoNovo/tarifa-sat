// Consultor de precios: teléfonos y portátiles de J.J., Depau y Megasur.
// Los datos van cifrados en consultor.enc (misma clave que la tarifa); se actualizan los lunes con la tarifa de J.J.
// Coste real = lo que le cuesta a la tienda con IVA y recargo de equivalencia (y canon). PVP sugerido = coste / (1 − margen), acabado en 9.
(function () {
  if (!window.RN_ABRIR) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const eur = n => (Math.round(n * 100) / 100).toLocaleString('es-ES', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' €';
  const MARGEN = { m: 25, ma: 8, p: 20 }; // móvil Android, móvil Apple (nuevo), portátil
  const GANA_MIN_MOVIL = 70; // Miguel 28/10/2026: en cada teléfono que se pida hay que ganar como mínimo 70–80 €
  const a9 = p => Math.ceil((p + 1) / 10) * 10 - 1;   // redondeo hacia arriba a un precio acabado en 9
  const pvp = (c, mg, movil) => { let p = a9(c / (1 - mg / 100)); if (movil && p - c < GANA_MIN_MOVIL) p = a9(c + GANA_MIN_MOVIL); return p; };
  const gb = n => n >= 1024 ? (n / 1024) + ' TB' : n + ' GB';

  const css = document.createElement('style');
  css.textContent = `
  #rn-con{display:inline-flex;align-items:center;gap:6px;font:600 .8rem var(--body,system-ui);border:1px solid var(--line,#d9e0e3);background:var(--panel,#fff);color:var(--fg,#14232b);border-radius:999px;padding:5px 11px;cursor:pointer;margin-left:6px}
  #rn-conbox{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.35);display:flex;align-items:flex-start;justify-content:center;padding:calc(14px + env(safe-area-inset-top,0px)) 8px 14px}
  #rn-conbox .pan{box-sizing:border-box;overflow-x:hidden;background:var(--panel,#fff);color:var(--fg,#14232b);border-radius:14px;max-width:980px;width:100%;max-height:calc(100vh - 28px);overflow:auto;padding:14px 16px;box-shadow:0 12px 40px rgba(0,0,0,.3)}
  #rn-conbox h2{font:700 1.25rem var(--display,system-ui);margin:0 0 4px;display:flex;justify-content:space-between;align-items:center;gap:8px}
  #rn-conbox h2 button{border:0;background:var(--soft,#e4f0f3);color:var(--accent,#0b6e8a);font:700 .95rem var(--body,system-ui);border-radius:8px;padding:6px 12px;cursor:pointer}
  #rn-conbox .q{color:var(--muted,#5b6b73);font-size:.85rem}
  #rn-conbox *{box-sizing:border-box}
  #rn-conbox form{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin:10px 0;padding:10px;border:1px solid var(--line,#d9e0e3);border-radius:10px;background:var(--bg,#f3f5f6)}
  #rn-conbox label{display:flex;flex-direction:column;gap:3px;min-width:0;font:600 .78rem var(--body,system-ui);color:var(--muted,#5b6b73)}
  #rn-conbox label.ck{flex-direction:row;align-items:center;gap:6px;color:var(--fg,#14232b);font-size:.9rem}
  #rn-conbox input,#rn-conbox select{font:500 .95rem var(--body,system-ui);padding:7px 8px;border:1px solid var(--line,#d9e0e3);border-radius:8px;background:var(--panel,#fff);color:var(--fg,#14232b);min-width:0;width:100%;box-sizing:border-box}
  #rn-conbox input[type=checkbox]{width:18px;height:18px;flex:none}
  #rn-conbox .seg{display:flex;gap:4px;grid-column:1/-1}
  #rn-conbox .seg button{flex:1;border:1px solid var(--line,#d9e0e3);background:var(--panel,#fff);border-radius:8px;padding:8px;font:700 .95rem var(--body,system-ui);cursor:pointer;color:var(--fg,#14232b)}
  #rn-conbox .seg button.on{background:var(--accent,#0b6e8a);border-color:var(--accent,#0b6e8a);color:#fff}
  #rn-conbox .res{display:grid;gap:8px}
  #rn-conbox .it{border:1px solid var(--line,#d9e0e3);border-left:4px solid var(--accent,#0b6e8a);border-radius:10px;padding:9px 11px;display:grid;grid-template-columns:1fr auto;gap:4px 12px;align-items:center}
  #rn-conbox .it b{font-size:1rem} #rn-conbox .it .pr{text-align:right;white-space:nowrap}
  #rn-conbox .it .pv{font:800 1.15rem var(--display,system-ui);color:#c62828}
  #rn-conbox .tag{display:inline-block;font:700 .72rem var(--body,system-ui);border-radius:999px;padding:2px 8px;margin-right:4px;background:var(--soft,#e4f0f3);color:var(--accent,#0b6e8a)}
  #rn-conbox .tag.st{background:#e3f4e8;color:#1f8a4c} #rn-conbox .tag.best{background:#fff1d6;color:#9a5b00}
  @media (max-width:600px){#rn-conbox .it{grid-template-columns:1fr}#rn-conbox .it .pr{text-align:left;white-space:normal}#rn-conbox form{grid-template-columns:1fr 1fr}}
  #rn-conbox .vacio{padding:20px;text-align:center;color:var(--muted,#5b6b73)}
  `;
  document.head.appendChild(css);

  const btn = document.createElement('button'); btn.type = 'button'; btn.id = 'rn-con'; btn.textContent = '💶 Consultor';
  btn.title = 'Consultor de precios de teléfonos y portátiles (J.J., Depau, Megasur)';
  (document.querySelector('header') || document.body).appendChild(btn);

  let datos = null, items = [];
  const f = { t: 'm', mc: '', md: '', ram: 0, alm: 0, pmin: '', pmax: '', g5: false, so: '', max: '', txt: '', mg: '', prov: '', tienda: false, ord: 'c' };
  try { Object.assign(f, JSON.parse(localStorage.getItem('rn_con_f') || '{}')); } catch (e) {}

  async function carga() {
    if (datos) return;
    datos = await window.RN_ABRIR('consultor.enc');
    items = [];
    Object.values(datos.prov || {}).forEach(p => (p.items || []).forEach(x => items.push(Object.assign({ prov: p.nombre, fecha: p.fecha }, x))));
  }

  // modelo sin memoria ni color: «Xiaomi Redmi Note 17 6GB/256GB» -> «Redmi Note 17»
  const base = x => { const b = base0(x); return /^\d/.test(b) ? (x.mc + ' ' + b) : b; };
  const base0 = x => x.n.split('/')[0].replace(/\s+\d+\s*(GB|TB)\b.*$/i, '').replace(new RegExp('^' + (x.mc || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+', 'i'), '').trim();

  function margenDe(x) { if (f.mg !== '' && !isNaN(+f.mg)) return +f.mg; return x.t === 'p' ? MARGEN.p : (x.mc === 'Apple' ? MARGEN.ma : MARGEN.m); }

  function filtra() {
    if (f.t === 'm') { f.ram = 0; f.pmin = ''; f.pmax = ''; f.mg = ''; f.prov = ''; f.g5 = false; }
    const txt = f.txt.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let r = items.filter(x => x.t === f.t
      && (!f.mc || x.mc === f.mc) && (!f.md || f.t !== 'm' || base(x) === f.md) && (!f.prov || x.prov === f.prov)
      && (!f.ram || (x.ram || 0) >= f.ram) && (!f.alm || (x.alm || 0) >= f.alm)
      && (f.pmin === '' || (x.pant || 0) >= +f.pmin) && (f.pmax === '' || (x.pant || 99) <= +f.pmax)
      && (!f.g5 || x.g5) && (!f.tienda || x.ti)
      && (!f.so || (f.so === 'win' ? /win/i.test(x.so || x.n) : f.so === 'sin' ? /sin sistema|freedos/i.test(x.so || x.n) : f.so === 'mac' ? x.mc === 'Apple' : /chrome/i.test(x.so || x.n)))
      && txt.every(w => x.n.toLowerCase().includes(w)));
    r.forEach(x => { x._mg = margenDe(x); x._pvp = pvp(x.c, x._mg, x.t === 'm'); });
    if (f.max !== '') r = r.filter(x => x._pvp <= +f.max);
    r.sort(f.ord === 'ram' ? (a, b) => (b.ram || 0) - (a.ram || 0) || a.c - b.c : f.ord === 'alm' ? (a, b) => (b.alm || 0) - (a.alm || 0) || a.c - b.c : (a, b) => a.c - b.c);
    // el más barato del mismo modelo entre proveedores
    const min = {}; r.forEach(x => { const k = x.n.toLowerCase().replace(/[^a-z0-9]/g, ''); if (!(k in min) || x.c < min[k]) min[k] = x.c; x._k = k; });
    r.forEach(x => x._best = Object.keys(datos.prov).length > 1 && r.filter(y => y._k === x._k).length > 1 && x.c === min[x._k]);
    return r;
  }

  function opciones(arr, val, fmt) { return arr.map(v => `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${fmt ? fmt(v) : v}</option>`).join(''); }

  function pinta(box) {
    const pan = box.querySelector('.pan');
    const marcas = [...new Set(items.filter(x => x.t === f.t).map(x => x.mc))].sort();
    const modelos = [...new Set(items.filter(x => x.t === 'm' && (!f.mc || x.mc === f.mc)).map(base))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
    if (f.md && !modelos.includes(f.md)) f.md = '';
    const provs = [...new Set(items.map(x => x.prov))].sort();
    const fechas = Object.values(datos.prov || {}).map(p => `${esc(p.nombre)} ${esc((p.fecha || '').split('-').reverse().join('/'))}`).join(' · ');
    const r = filtra();
    pan.innerHTML = `<h2><span>💶 Consultor de precios</span><button type="button" data-x>Cerrar</button></h2>
      <div class="q">Tarifas: ${fechas}. Coste real con IVA y recargo. PVP sugerido ${f.t === 'm' ? 'con margen del 25 % (8 % en iPhone nuevo) y ganando como mínimo 70–80 € por teléfono' : `con margen del ${f.mg !== '' ? f.mg : 20} %`}, acabado en 9.</div>
      <form>
        <div class="seg"><button type="button" data-t="m" class="${f.t === 'm' ? 'on' : ''}">📱 Teléfonos</button><button type="button" data-t="p" class="${f.t === 'p' ? 'on' : ''}">💻 Portátiles</button></div>
        <label>Marca<select name="mc"><option value="">Todas</option>${opciones(marcas, f.mc)}</select></label>
        ${f.t === 'm' ? `<label>Modelo<select name="md"><option value="">Todos</option>${opciones(modelos, f.md)}</select></label>` : ''}
        ${f.t === 'p' ? `<label>RAM mínima<select name="ram"><option value="0">Cualquiera</option>${opciones([3, 4, 6, 8, 12, 16, 24, 32, 64], f.ram, v => v + ' GB')}</select></label>` : ''}
        ${f.t === 'p' ? `<label>Pantalla desde (")<input name="pmin" inputmode="decimal" placeholder="${f.t === 'm' ? '6.5' : '14'}" value="${esc(f.pmin)}"></label>
        <label>Pantalla hasta (")<input name="pmax" inputmode="decimal" placeholder="${f.t === 'm' ? '6.9' : '16'}" value="${esc(f.pmax)}"></label>` : ''}
        ${f.t === 'p' ? `<label>Sistema<select name="so"><option value="">Cualquiera</option>${opciones(['win', 'sin', 'mac', 'chrome'], f.so, v => ({ win: 'Windows', sin: 'Sin sistema', mac: 'macOS', chrome: 'Chrome OS' })[v])}</select></label>` : ''}
        <label>PVP hasta (€)<input name="max" inputmode="numeric" placeholder="300" value="${esc(f.max)}"></label>
        ${f.t === 'p' ? `<label>Margen % (opcional)<input name="mg" inputmode="numeric" placeholder="auto" value="${esc(f.mg)}"></label>
        <label>Proveedor<select name="prov"><option value="">Todos</option>${opciones(provs, f.prov)}</select></label>` : ''}
        <label>Ordenar<select name="ord">${opciones(['c', 'ram', 'alm'], f.ord, v => ({ c: 'Más barato', ram: 'Más RAM', alm: 'Más memoria' })[v])}</select></label>
        <label>Buscar<input name="txt" placeholder="note 17, galaxy…" value="${esc(f.txt)}"></label>
        <label>Almacenamiento mín.<select name="alm"><option value="0">Cualquiera</option>${opciones([64, 128, 256, 512, 1024, 2048], f.alm, gb)}</select></label>
        <label class="ck"><input type="checkbox" name="tienda" ${f.tienda ? 'checked' : ''}> Solo lo que hay en tienda</label>
      </form>
      <div class="q" style="margin-bottom:6px">${r.length} resultado${r.length === 1 ? '' : 's'}</div>
      <div class="res">${r.slice(0, 150).map(x => `<div class="it">
          <div><b>${esc(x.n.replace(/\//g, ' / '))}</b><br>
            <span class="tag">${esc(x.prov)}</span>${x._best ? '<span class="tag best">El más barato</span>' : ''}${x.ti ? `<span class="tag st">En tienda: ${x.ti} a ${eur(x.pt)}</span>` : ''}
            <span class="q">${[x.ram ? x.ram + ' GB RAM' : '', x.alm ? gb(x.alm) : '', x.pant ? x.pant + '"' : '', x.g5 ? '5G' : '', x.cpu || '', x.col && x.col.length ? x.col.join(', ') : ''].filter(Boolean).map(esc).join(' · ')}</span></div>
          <div class="pr"><span class="pv">${eur(x._pvp)}</span><br><span class="q">Coste ${eur(x.c)} · ganas ${eur(x._pvp - x.c)} (${Math.round((x._pvp - x.c) / x._pvp * 100)} %)</span></div>
        </div>`).join('') || '<div class="vacio">No hay ningún equipo con esos datos. Prueba a quitar algún filtro.</div>'}</div>`;
    pan.querySelector('[data-x]').onclick = () => box.remove();
    pan.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { f.t = b.dataset.t; f.mc = ''; f.md = ''; f.so = ''; guarda(); pinta(box); });
    const form = pan.querySelector('form');
    const lee = () => {
      const fd = new FormData(form);
      ['mc', 'md', 'pmin', 'pmax', 'so', 'max', 'txt', 'mg', 'prov', 'ord'].forEach(k => { if (fd.has(k)) f[k] = String(fd.get(k)).replace(',', '.'); });
      f.ram = +fd.get('ram') || 0; f.alm = +fd.get('alm') || 0; f.g5 = fd.has('g5'); f.tienda = fd.has('tienda');
      guarda();
    };
    form.addEventListener('change', e => { lee(); const foco = e.target.name; pinta(box); });
    form.addEventListener('input', e => { if (e.target.tagName !== 'INPUT' || e.target.type === 'checkbox') return; clearTimeout(form._t); const n = e.target.name, pos = e.target.selectionStart; form._t = setTimeout(() => { lee(); pinta(box); const el = box.querySelector(`[name="${n}"]`); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (_) {} } }, 400); });
    form.addEventListener('submit', e => e.preventDefault());
  }
  function guarda() { try { localStorage.setItem('rn_con_f', JSON.stringify(f)); } catch (e) {} }

  btn.onclick = async () => {
    const box = document.createElement('div'); box.id = 'rn-conbox'; box.innerHTML = '<div class="pan"><p class="q">Cargando precios…</p></div>';
    box.addEventListener('click', e => { if (e.target === box) box.remove(); });
    document.body.appendChild(box);
    try { await carga(); pinta(box); }
    catch (e) { box.querySelector('.pan').innerHTML = `<p class="q">No se han podido cargar los precios (${esc(e.message)}).</p><button type="button" onclick="this.closest('#rn-conbox').remove()">Cerrar</button>`; }
  };
})();
