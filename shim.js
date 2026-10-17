// Adaptador: la página se escribió para el almacén de Claude (claude.use('db')).
// Aquí se ofrece la misma forma —collection(x).onSnapshot / add / doc(id).update—
// guardando en Supabase (tabla docs) y sincronizando en tiempo real entre dispositivos.
(function () {
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

  async function cargar(nombre) {
    const c = cols[nombre];
    const { data, error } = await sb.from('docs').select('id,data').eq('coleccion', nombre).limit(5000);
    if (error) { c.subs.forEach(o => o.err && o.err(error)); return; }
    c.map = new Map(data.map(r => [r.id, r.data]));
    c.cargado = true;
    emitir(c);
  }

  function col(nombre) {
    if (cols[nombre]) return cols[nombre];
    const c = cols[nombre] = { map: new Map(), subs: new Set(), canal: null, cargado: false };
    c.canal = sb.channel('docs-' + nombre)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: 'coleccion=eq.' + nombre }, p => {
        if (p.eventType === 'DELETE') c.map.delete(p.old.id);
        else c.map.set(p.new.id, p.new.data);
        emitir(c);
      })
      .subscribe(st => { if (st === 'SUBSCRIBED') cargar(nombre); });
    return c;
  }

  // Al volver a la app (móvil que estaba en segundo plano) se recarga todo por si se perdió algún cambio.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') Object.keys(cols).forEach(n => cargar(n));
  });
  window.addEventListener('online', () => Object.keys(cols).forEach(n => cargar(n)));

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
