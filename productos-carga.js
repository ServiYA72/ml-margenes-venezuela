/* Carga de productos de Nicom — la misma para todas las pantallas (Productos, Cotizaciones, Ventas, Publicaciones ML, Análisis de competencia).
   Por qué existe: antes cada pantalla traía los productos con su propio ciclo. Con más de 5.000 productos, las tandas del fondo
   se pasaban del tiempo permitido por Supabase ("statement timeout"), la pantalla no avisaba y se quedaba con una parte (ej. 3.000 de 5.820),
   y los productos que quedaban fuera no se podían buscar ni editar.
   Qué hace:
   - primero pide la lista liviana de ids (rápido) y luego los datos completos en grupos de 100, de a 6 a la vez; cada grupo cuesta lo mismo (antes, las tandas del fondo eran cada vez más lentas)
   - siempre ordena con "id" como desempate (sin eso, productos con el mismo nombre se repiten o se saltan entre tanda y tanda)
   - si una tanda falla, la reintenta hasta 3 veces antes de rendirse
   - compara con el total real de la base y, si no se cargó todo, muestra un aviso visible con botón "Reintentar"
   Uso: const r = await NicomProductos.cargarTodos(supabase, "id, nombre, ...", { orden: [{col:"nombre",asc:true}], reintentar: cargarProductos });
        r.filas = productos cargados · r.total = total real en la base (o null) · r.completo = true si se cargó todo */
(function () {
  var PAGINA_IDS = 1000, GRUPO = 100, PARALELO = 10, REINTENTOS = 3, ID_AVISO = "aviso-carga-productos";

  function esperar(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }

  // Ejecuta un pedido; si el servidor falla, espera un poco y vuelve a intentar.
  async function conReintento(pedir) {
    var ultimoError = null;
    for (var intento = 0; intento <= REINTENTOS; intento++) {
      if (intento > 0) await esperar(700 * intento);
      var r = await pedir();
      if (!r.error) return r.data || [];
      ultimoError = r.error;
    }
    throw ultimoError;
  }

  // Corre las tareas de a PARALELO a la vez y devuelve los resultados en el mismo orden.
  async function enParalelo(tareas) {
    var out = new Array(tareas.length), sig = 0;
    async function trabajador() {
      while (sig < tareas.length) {
        var i = sig++;
        try { out[i] = { ok: true, data: await tareas[i]() }; }
        catch (e) { out[i] = { ok: false, err: e }; }
      }
    }
    var t = [];
    for (var k = 0; k < PARALELO; k++) t.push(trabajador());
    await Promise.all(t);
    return out;
  }

  function quitarAviso() {
    var a = document.getElementById(ID_AVISO);
    if (a && a.parentNode) a.parentNode.removeChild(a);
  }

  function mostrarAviso(cargados, total, reintentar) {
    quitarAviso();
    var a = document.createElement("div");
    a.id = ID_AVISO;
    a.setAttribute("role", "alert");
    a.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:99999;max-width:92vw;background:#b42318;color:#fff;padding:10px 14px;border-radius:8px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3);display:flex;gap:12px;align-items:center;flex-wrap:wrap;justify-content:center";
    var t = document.createElement("span");
    t.textContent = total != null
      ? "Solo se cargaron " + cargados + " de " + total + " productos. Algunos no aparecerán en las búsquedas."
      : "No se pudieron cargar todos los productos (van " + cargados + "). Algunos no aparecerán en las búsquedas.";
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = "Reintentar";
    b.style.cssText = "background:#fff;color:#b42318;border:0;border-radius:6px;padding:6px 12px;font:600 14px system-ui,sans-serif;cursor:pointer";
    b.onclick = function () {
      quitarAviso();
      if (typeof reintentar === "function") reintentar(); else location.reload();
    };
    a.appendChild(t); a.appendChild(b);
    document.body.appendChild(a);
  }

  async function cargarDeRed(supabase, columnas, opciones) {
    opciones = opciones || {};
    var orden = opciones.orden || [{ col: "created_at", asc: false }, { col: "id", asc: true }];
    if (!orden.some(function (o) { return o.col === "id"; })) orden = orden.concat([{ col: "id", asc: true }]);

    // Total real de productos en la base, para saber si faltó alguno.
    var total = null;
    try {
      var c = await supabase.from("productos").select("id", { count: "exact", head: true });
      if (!c.error && typeof c.count === "number") total = c.count;
    } catch (e) {}

    var fallo = null, filas = [];

    // Paso 1: lista liviana (solo "id") en el orden pedido. Es rápida porque no trae los datos pesados.
    // Si se conoce el total, todas las páginas de ids se piden a la vez (antes iban una tras otra).
    var llaves = [];
    function paginaIds(pag) {
      return conReintento(function () {
        var q = supabase.from("productos").select("id");
        orden.forEach(function (o) { q = q.order(o.col, { ascending: o.asc }); });
        return q.range(pag * PAGINA_IDS, pag * PAGINA_IDS + PAGINA_IDS - 1);
      });
    }
    if (total != null && total > 0) {
      var paginas = [];
      for (var pg = 0; pg * PAGINA_IDS < total; pg++) paginas.push(pg);
      var resIds = await enParalelo(paginas.map(function (n) { return function () { return paginaIds(n); }; }));
      for (var k = 0; k < resIds.length; k++) {
        if (!resIds[k].ok) { fallo = fallo || resIds[k].err; continue; }
        llaves = llaves.concat(resIds[k].data.map(function (x) { return x.id; }));
      }
    } else {
      for (var pag = 0; ; pag++) {
        try {
          var d = await paginaIds(pag);
          llaves = llaves.concat(d.map(function (x) { return x.id; }));
          if (d.length < PAGINA_IDS) break;
        } catch (e) { fallo = e; break; }
      }
    }

    // Paso 2: los datos completos por grupos de ids (cada grupo cuesta lo mismo, sin importar qué tan al fondo esté).
    var grupos = [];
    for (var i = 0; i < llaves.length; i += GRUPO) grupos.push(llaves.slice(i, i + GRUPO));
    var res = await enParalelo(grupos.map(function (ids) {
      return function () { return conReintento(function () { return supabase.from("productos").select(columnas).in("id", ids); }); };
    }));
    for (var g = 0; g < res.length; g++) {
      if (!res[g].ok) { fallo = fallo || res[g].err; continue; }
      var porId = {};
      res[g].data.forEach(function (f) { porId[f.id] = f; });
      grupos[g].forEach(function (id) { if (porId[id]) filas.push(porId[id]); });   // respeta el orden pedido
    }

    if (fallo) console.error("Error cargando productos", fallo);
    var completo = !fallo && (total == null || filas.length >= total);
    if (completo) quitarAviso(); else mostrarAviso(filas.length, total, opciones.reintentar);
    return { filas: filas, total: total, completo: completo };
  }


  // ---- Copia en el navegador (opcional) ----
  // Si la pantalla lo pide (opciones.cache = { clave, alEmpezar, alActualizar }), se muestra al instante lo guardado la vez anterior
  // y en segundo plano se trae la versión real de la base; cuando llega, se guarda y se avisa con alActualizar(resultado).
  // Los datos reales siempre mandan: la copia solo adelanta lo que se ve mientras tanto. Va atada al usuario (clave) y se borra al cerrar sesión.
  var BD = "nicom-cache-productos", ALM = "datos", REG = "productos", vigilando = false;

  function abrirBD() {
    return new Promise(function (ok) {
      try {
        var r = indexedDB.open(BD, 1);
        r.onupgradeneeded = function () { r.result.createObjectStore(ALM); };
        r.onsuccess = function () { ok(r.result); };
        r.onerror = r.onblocked = function () { ok(null); };
      } catch (e) { ok(null); }
    });
  }
  async function leerCache(clave) {
    var bd = await abrirBD();
    if (!bd) return null;
    return new Promise(function (ok) {
      try {
        var q = bd.transaction(ALM, "readonly").objectStore(ALM).get(REG);
        q.onsuccess = function () { var v = q.result; bd.close(); ok(v && v.clave === clave && Array.isArray(v.filas) ? v : null); };
        q.onerror = function () { bd.close(); ok(null); };
      } catch (e) { try { bd.close(); } catch (e2) {} ok(null); }
    });
  }
  async function guardarCache(clave, filas) {
    var bd = await abrirBD();
    if (!bd) return;
    return new Promise(function (ok) {
      try {
        var tx = bd.transaction(ALM, "readwrite");
        tx.objectStore(ALM).put({ clave: clave, filas: filas, guardado: Date.now() }, REG);
        tx.oncomplete = function () { bd.close(); ok(); };
        tx.onerror = tx.onabort = function () { bd.close(); ok(); };   // si no cabe o falla, simplemente no hay copia
      } catch (e) { try { bd.close(); } catch (e2) {} ok(); }
    });
  }
  async function limpiarCache() {
    var bd = await abrirBD();
    if (!bd) return;
    return new Promise(function (ok) {
      try {
        var tx = bd.transaction(ALM, "readwrite");
        tx.objectStore(ALM).delete(REG);
        tx.oncomplete = function () { bd.close(); ok(); };
        tx.onerror = tx.onabort = function () { bd.close(); ok(); };
      } catch (e) { try { bd.close(); } catch (e2) {} ok(); }
    });
  }
  function copiar(filas) {
    try { return typeof structuredClone === "function" ? structuredClone(filas) : JSON.parse(JSON.stringify(filas)); }
    catch (e) { return null; }
  }
  function vigilarSesion(supabase) {
    if (vigilando) return;
    vigilando = true;
    try { supabase.auth.onAuthStateChange(function (ev) { if (ev === "SIGNED_OUT") limpiarCache(); }); } catch (e) {}
  }

  async function cargarTodos(supabase, columnas, opciones) {
    var c = opciones && opciones.cache;
    if (!c || !c.clave) return cargarDeRed(supabase, columnas, opciones);
    vigilarSesion(supabase);
    var guardado = await leerCache(c.clave);
    if (guardado) {
      if (typeof c.alEmpezar === "function") { try { c.alEmpezar(); } catch (e) {} }
      cargarDeRed(supabase, columnas, opciones).then(async function (r) {
        if (r.completo) { var cp = copiar(r.filas); if (cp) await guardarCache(c.clave, cp); }
        if (typeof c.alActualizar === "function") c.alActualizar(r);
      }).catch(function (e) {
        console.error("Error actualizando productos", e);
        if (typeof c.alActualizar === "function") c.alActualizar(null);
      });
      return { filas: guardado.filas, total: guardado.filas.length, completo: true, desdeCache: true };
    }
    var r = await cargarDeRed(supabase, columnas, opciones);
    if (r.completo) { var cp2 = copiar(r.filas); if (cp2) guardarCache(c.clave, cp2); }
    return r;
  }

  window.NicomProductos = { cargarTodos: cargarTodos, limpiarCache: limpiarCache };
})();
