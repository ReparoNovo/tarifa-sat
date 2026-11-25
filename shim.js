// Adaptador: la página se escribió para el almacén de Claude (claude.use('db')).
// Aquí se ofrece la misma forma —collection(x).onSnapshot / add / doc(id).update—
// guardando en Supabase (tabla docs) y sincronizando en tiempo real entre dispositivos.
(function () {
  if (!window.supabase || !window.RN_CONFIG) {   // no ha cargado la librería: en vez de pantalla en blanco, botón para reintentar
    document.addEventListener('DOMContentLoaded', () => { document.body.insertAdjacentHTML('afterbegin', '<div style="position:fixed;inset:0;z-index:200;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#f3f5f6;font:16px system-ui;padding:20px;text-align:center"><b>No se ha podido abrir la app</b><span>Revisa la conexión y vuelve a intentarlo.</span><button onclick="location.reload()" style="font:700 1rem system-ui;padding:12px 18px;border:0;border-radius:10px;background:#0b6e8a;color:#fff">Reintentar</button></div>'); });
    return;
  }
  const sb = window.supabase.createClient(RN_CONFIG.url, RN_CONFIG.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 10 } }
  });
  window.SB = sb;

  const cols = {};          // coleccion -> {map, subs:Set, canal, cargado}

  function snap(c) {
    const docs = [...c.map.entries()].map(([id, data]) => ({ id, data: () => data, exists: true }));
    return { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f) };
  }
  function emitir(c) { const s = snap(c); c.subs.forEach(o => { try { o.cb(s); } catch (e) { console.error(e); } }); }

  // Marca de la última modificación vista (updated_at de la tabla docs): sirve para pedir solo lo que ha cambiado.
  let ultima = null;
  const marca = t => { if (t && (!ultima || t > ultima)) ultima = t; };

  async function cargar(nombre) {
    const c = cols[nombre];
    const { data, error } = await sb.from('docs').select('id,data,updated_at').eq('coleccion', nombre).limit(5000);
    if (error) { c.subs.forEach(o => o.err && o.err(error)); return; }
    c.map = new Map(data.map(r => [r.id, r.data]));
    data.forEach(r => marca(r.updated_at));
    c.cargado = true;
    emitir(c);
  }

  // Tiempo real. Si el canal se cae (móvil en segundo plano, cambio de wifi, sesión renovada…), se vuelve a abrir solo.
  function abrirCanal(nombre) {
    const c = cols[nombre];
    if (c.canal) { try { sb.removeChannel(c.canal); } catch (e) {} }
    c.canal = sb.channel('docs-' + nombre + '-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: 'coleccion=eq.' + nombre }, p => {
        if (p.eventType === 'DELETE') c.map.delete(p.old.id);
        else { c.map.set(p.new.id, p.new.data); marca(p.new.updated_at); }
        emitir(c);
      })
      .subscribe(st => {
        if (st === 'SUBSCRIBED') cargar(nombre);
        else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') {
          clearTimeout(c.reabrir); c.reabrir = setTimeout(() => abrirCanal(nombre), 4000);
        }
      });
  }

  function col(nombre) {
    if (cols[nombre]) return cols[nombre];
    cols[nombre] = { map: new Map(), subs: new Set(), canal: null, cargado: false };
    abrirCanal(nombre);
    return cols[nombre];
  }

  // Cuando se renueva la sesión, el tiempo real tiene que usar la clave nueva; si no, deja de avisar sin dar error.
  sb.auth.onAuthStateChange((ev, s) => { if (s && s.access_token) { try { sb.realtime.setAuth(s.access_token); } catch (e) {} } });

  // Red de seguridad: cada 15 s (con la app a la vista) se piden los apuntes que han cambiado desde la última vez.
  // Así, aunque el tiempo real falle, lo que apunta otro ordenador o móvil aparece solo, sin salir y volver a entrar.
  let pidiendo = false;
  async function revisar() {
    const nombres = Object.keys(cols).filter(n => cols[n].cargado);
    if (pidiendo || !nombres.length || !ultima || document.visibilityState !== 'visible') return;
    pidiendo = true;
    try {
      const { data, error } = await sb.from('docs').select('coleccion,id,data,updated_at')
        .in('coleccion', nombres).gt('updated_at', ultima).order('updated_at').limit(500);
      if (error || !data || !data.length) return;
      const tocadas = new Set();
      data.forEach(r => { const c = cols[r.coleccion]; if (!c) return; c.map.set(r.id, r.data); marca(r.updated_at); tocadas.add(c); });
      tocadas.forEach(emitir);
    } finally { pidiendo = false; }
  }
  setInterval(revisar, 15000);

  // Al volver a la app (móvil que estaba en segundo plano) se recarga todo y se reabre el tiempo real.
  function despertar() {
    Object.keys(cols).forEach(n => {
      const c = cols[n];
      if (!c.canal || c.canal.state !== 'joined') abrirCanal(n); else cargar(n);
    });
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') despertar(); });
  window.addEventListener('online', despertar);
  window.addEventListener('focus', revisar);

  function fallo(error) { const e = new Error(error.message || 'Error al guardar'); e.code = error.code; return e; }

  const db = {
    collection(nombre) {
      return {
        onSnapshot(cb, err) {
          const c = col(nombre); const o = { cb, err }; c.subs.add(o);
          if (c.cargado) setTimeout(() => cb(snap(c)), 0);
          return () => c.subs.delete(o);
        },
        async add(obj) {
          const { data, error } = await sb.from('docs').insert({ coleccion: nombre, data: obj }).select('id').single();
          if (error) throw fallo(error);
          const c = col(nombre); c.map.set(data.id, obj); emitir(c);
          return { id: data.id };
        },
        doc(id) {
          return {
            id,
            async update(p) {
              const { error } = await sb.rpc('doc_patch', { c: nombre, i: id, p });
              if (error) throw fallo(error);
              const c = col(nombre); c.map.set(id, { ...(c.map.get(id) || {}), ...p }); emitir(c);
            },
            async set(obj) {
              const { error } = await sb.from('docs').upsert({ coleccion: nombre, id, data: obj });
              if (error) throw fallo(error);
              const c = col(nombre); c.map.set(id, obj); emitir(c);
            },
            async get() {
              const { data } = await sb.from('docs').select('data').eq('coleccion', nombre).eq('id', id).maybeSingle();
              return { id, exists: !!data, data: () => data && data.data };
            }
          };
        }
      };
    }
  };

  const user = {
    async can() { return true; },
    get email() { return window.RN_USER && window.RN_USER.email; },
    get name() { return window.RN_USER && window.RN_USER.nombre; }
  };

  window.claude = window.claude || {};
  window.claude.use = async function (cap) {
    if (cap === 'db') return db;
    if (cap === 'user') return user;
    return null;
  };
})();
